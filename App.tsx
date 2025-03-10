import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import TcpSocket from 'react-native-tcp-socket';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { NetworkInfo } from 'react-native-network-info';
import {
  addBreaks,
  centerText,
  dottedLine,
  printQRCode,
  boldText,
  leftRightText,
  reset,
  setTextSize,
} from './escpos-commands';
import { formatInvoice, Invoice as BaseInvoice } from './InvoiceFormatter';

// Extend the imported Invoice interface to accept a custom printerWidth.
interface Invoice extends BaseInvoice {
  printerWidth?: number;
}

global.Buffer = Buffer;

// For BLE, we use id instead of address.
interface BluetoothDevice {
  id: string;
  name: string;
}

// Helper to check if a characteristic is writable.
const isWritableCharacteristic = (char: any): boolean => {
  if (!char.properties) return false;

  // If properties is an object (as in your sample data).
  if (typeof char.properties === 'object' && !Array.isArray(char.properties)) {
    const keys = Object.keys(char.properties);
    return keys.some((key: string) =>
      key.toLowerCase() === 'write' || key.toLowerCase() === 'writewithoutresponse'
    );
  }

  // If properties is an array.
  if (Array.isArray(char.properties)) {
    return char.properties.some((prop: string) =>
      prop.toLowerCase() === 'write' || prop.toLowerCase() === 'writewithoutresponse'
    );
  }

  // If properties is a comma-separated string.
  if (typeof char.properties === 'string') {
    const props = char.properties.split(',').map((s: string) => s.trim());
    return props.some((prop: string) =>
      prop.toLowerCase() === 'write' || prop.toLowerCase() === 'writewithoutresponse'
    );
  }
  
  return false;
};

const App: React.FC = () => {
  // Subdomain configuration.
  const [internetSubdomain, setInternetSubdomain] = useState<string | null>(null);
  const [subdomainInput, setSubdomainInput] = useState<string>('');

  // Printer width configuration.
  const [printerWidth, setPrinterWidth] = useState<string>('48');
  const [editingPrinterWidth, setEditingPrinterWidth] = useState<boolean>(false);
  const printerWidthRef = useRef(printerWidth);
  useEffect(() => {
    printerWidthRef.current = printerWidth;
  }, [printerWidth]);

  // Loading state when connecting to a printer.
  const [connecting, setConnecting] = useState<boolean>(false);

  // Printing state: when a print request is in progress.
  const [printing, setPrinting] = useState<boolean>(false);

  // WebView state and spinner.
  const [showWebView, setShowWebView] = useState<boolean>(false);
  const [webviewLoading, setWebviewLoading] = useState<boolean>(false);
  const [hasWebviewLoaded, setHasWebviewLoaded] = useState<boolean>(false);
  const webviewTimeoutRef = useRef<any>(null);

  // BLE Devices state.
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [currentCandidate, setCurrentCandidate] = useState<{ service: string; characteristic: string } | null>(null);
  // Use refs to always have the latest connection info.
  const connectedDeviceRef = useRef<BluetoothDevice | null>(null);
  const currentCandidateRef = useRef<{ service: string; characteristic: string } | null>(null);

  // TCP server.
  const [server, setServer] = useState<any>(null);

  // Load saved configuration on mount.
  useEffect(() => {
    AsyncStorage.getItem('internetSubdomain')
      .then((value) => { if (value) setInternetSubdomain(value); })
      .catch((err) => console.error('Error loading subdomain:', err));
    AsyncStorage.getItem('printerWidth')
      .then((value) => { if (value) setPrinterWidth(value); })
      .catch((err) => console.error('Error loading printer width:', err));
  }, []);

  // Remember last connected device and attempt reconnect.
  useEffect(() => {
    const tryReconnect = async () => {
      const lastConnected = await AsyncStorage.getItem('lastConnectedDevice');
      if (lastConnected && devices.length > 0) {
        const device = devices.find(d => d.id === lastConnected) || { id: lastConnected, name: 'Unknown Device' };
        connectToDeviceNow(device);
      }
    };
    tryReconnect();
  }, [devices]);

  // Update refs when state changes.
  useEffect(() => {
    connectedDeviceRef.current = connectedDevice;
  }, [connectedDevice]);

  useEffect(() => {
    currentCandidateRef.current = currentCandidate;
  }, [currentCandidate]);

  // Automatically open the WebView when a printer gets connected.
  useEffect(() => {
    if (connectedDevice) {
      setShowWebView(true);
    }
  }, [connectedDevice]);

  // Request Bluetooth and location permissions (for BLE).
  const requestBluetoothPermissions = async (): Promise<void> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        console.log('Bluetooth permissions granted:', granted);
      } catch (err) {
        console.error('Error requesting Bluetooth permissions:', err);
      }
    }
  };

  // Initialize BLE Manager.
  useEffect(() => {
    requestBluetoothPermissions();
    BleManager.start({ showAlert: false })
      .then(() => console.log('BleManager started'))
      .catch(err => console.error('BleManager start error:', err));
    // Start a scan on mount (adjust scan duration as needed)
    scanDevices();
  }, []);

  // Scan for BLE devices for 5 seconds.
  const scanDevices = async (): Promise<void> => {
    setDevices([]);
    console.log('Starting BLE scan...');
    try {
      await BleManager.scan([], 5, true);
      // Wait for 5 seconds.
      await new Promise(resolve => setTimeout(resolve, 5000));
      BleManager.stopScan();
      console.log('Scan stopped');
      const peripherals = await BleManager.getDiscoveredPeripherals();
      console.log('Discovered peripherals:', peripherals);
      // Filter to only include devices that have a name.
      const filtered = peripherals.filter((p: any) => p.name);
      // Map to our BluetoothDevice interface (using id and name).
      const bleDevices: BluetoothDevice[] = filtered.map((p: any) => ({ id: p.id, name: p.name }));
      setDevices(bleDevices);
      if (bleDevices.length === 0) {
        Alert.alert('No devices found', 'Ensure your printer is on and advertising.');
      }
    } catch (err) {
      console.error('Error scanning devices:', err);
    }
  };

  // Ask for confirmation before connecting to a device.
  const handleConnect = (device: BluetoothDevice) => {
    Alert.alert(
      "Connect to Printer",
      `Do you want to connect to printer ${device.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "OK", onPress: () => connectToDeviceNow(device) }
      ]
    );
  };

  // Connect to a BLE device and select the first writable characteristic.
  const connectToDeviceNow = async (device: BluetoothDevice): Promise<void> => {
    setConnecting(true);
    try {
      console.log('Connecting to', device.id);
      await BleManager.connect(device.id);
      console.log('Connected to device', device.id);
      // Wait a bit for services to be discovered.
      await new Promise(resolve => setTimeout(resolve, 1000));
      const peripheralInfo = await BleManager.retrieveServices(device.id);
      console.log('Peripheral info:', peripheralInfo);

      if (!peripheralInfo.characteristics || peripheralInfo.characteristics.length === 0) {
        Alert.alert('No characteristics found', 'No characteristics were discovered. Disconnecting.');
        await BleManager.disconnect(device.id);
        return;
      }

      // Filter for writable characteristics.
      const writable = peripheralInfo.characteristics.filter((char: any) => isWritableCharacteristic(char));
      if (writable.length === 0) {
        Alert.alert('No writable characteristics', 'This device does not support writable characteristics. Disconnecting.');
        await BleManager.disconnect(device.id);
        return;
      }

      setConnectedDevice({ id: device.id, name: device.name });
      await AsyncStorage.setItem('lastConnectedDevice', device.id);
      // Select the first writable candidate.
      const candidate = { service: writable[0].service, characteristic: writable[0].characteristic };
      setCurrentCandidate(candidate);
      Alert.alert(
        'Connected',
        `Connected to ${device.name}\nUsing candidate:\nService: ${candidate.service}\nCharacteristic: ${candidate.characteristic}`
      );
      console.log('Current candidate:', candidate);
    } catch (e: any) {
      console.error('Connection failed:', e);
      disconnectFromDevice();
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect from the current BLE device.
  const disconnectFromDevice = async () => {
    if (connectedDevice) {
      try {
        await BleManager.disconnect(connectedDevice.id);
      } catch (e) {
        console.error("Error disconnecting", e);
      } finally {
        setConnectedDevice(null);
        setCurrentCandidate(null);
        setShowWebView(false);
        await AsyncStorage.removeItem('lastConnectedDevice');
      }
    }
  };

  // Helper: Write to BLE device with a 5-second timeout.
  const writeToDeviceWithTimeout = async (deviceId: string, data: number[], timeout = 5000) => {
    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error("Print timeout"));
      }, timeout);

      BleManager.writeWithoutResponse(
        deviceId,
        currentCandidateRef.current!.service,
        currentCandidateRef.current!.characteristic,
        data
      )
        .then((res: any) => {
          if (!timedOut) {
            clearTimeout(timer);
            resolve(res);
          }
        })
        .catch((err: any) => {
          if (!timedOut) {
            clearTimeout(timer);
            reject(err);
          }
        });
    });
  };

  // Print invoice using BLE. Uses invoice.printerWidth if provided.
  const printInvoice = async (invoice: Invoice): Promise<void> => {
    // Use the refs to ensure we're using the latest connection info.
    if (!connectedDeviceRef.current || !currentCandidateRef.current) {
      Alert.alert("Not Connected", "No printer is connected.");
      return;
    }
    setPrinting(true);
    try {
      const invoiceWidth = invoice.printerWidth ?? (parseInt(printerWidthRef.current, 10) || 48);
      console.log("Using printer width:", invoiceWidth);
      const commands = formatInvoice(invoice, invoiceWidth);
      const encodedCommands = Buffer.from(commands, 'latin1');
      console.log('Printing invoice (first 100 bytes):', encodedCommands.slice(0, 100));
      // Convert Buffer to array of numbers.
      const dataArray = Array.from(encodedCommands);
      // Write with a 5-second timeout.
      await writeToDeviceWithTimeout(connectedDeviceRef.current.id, dataArray, 5000);
      console.log('Printed invoice successfully');
    } catch (error) {
      console.error('Printing invoice failed:', error);
      disconnectFromDevice();
      Alert.alert("Printer Disconnected", "The printer appears to be disconnected. Please reconnect.");
      throw error;
    } finally {
      setPrinting(false);
    }
  };

  const printTestMessage = async (): Promise<void> => {
    await printInvoice({
      invoiceType: "Fature Shitje",
      header: "Invoice Header",
      invNumber: 15,
      tin: "123456789",
      address: "123 Main Street",
      fiscString: "Fiscal Info",
      opCode: "OP01",
      buCode: "BU01",
      Date: "2023-09-25",
      lines: [
        { productName: "qumesht", quantity: 1, price: 2.5, fullPrice: 2.5, discountAmount: 0, uom: "Cope" },
        { productName: "vaj", quantity: 2, price: 1.5, fullPrice: 3.0, discountAmount: 0, uom: "Litra" },
      ],
      totalPriceNoVat: 5.5,
      vat: [{ vatType: "Standard", amount: 1.1 }],
      totalDiscount: 0,
      totalPrice: 6.6,
      Exrate: 1,
      CustomerName: "John Doe",
      CustomerTin: "987654321",
      CustomerContact: "555-1234",
      CustomerAddress: "456 Other St",
      qrCode: "https://example.com/invoice/123",
      qrSize: 8,
      IIC: "IICDATA",
      FIC: "FICDATA",
      Footer: "Thank you for your purchase!",
    });
  };

  // TCP server setup.
  useEffect(() => {
    const tcpServer = TcpSocket.createServer((socket: any) => {
      socket.on('data', async (data: string | Buffer) => {
        const requestStr = typeof data === 'string' ? data.trim() : data.toString('utf8').trim();
        console.log('Received request:\n', requestStr);
        // Handle OPTIONS requests.
        if (requestStr.startsWith('OPTIONS')) {
          const optionsResponse =
            'HTTP/1.1 204 No Content\r\n' +
            'Access-Control-Allow-Origin: *\r\n' +
            'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n' +
            'Access-Control-Allow-Headers: Content-Type, authorization\r\n' +
            'Content-Length: 0\r\n\r\n';
          socket.write(optionsResponse);
          return;
        }
        if (requestStr.startsWith('POST /print')) {
          const delimiter = '\r\n\r\n';
          const bodyIndex = requestStr.indexOf(delimiter);
          let statusLine = 'HTTP/1.1 200 OK\r\n';
          if (bodyIndex >= 0) {
            const body = requestStr.slice(bodyIndex + delimiter.length).trim();
            if (body) {
              try {
                const invoice: Invoice = JSON.parse(body);
                console.log('Invoice data received:', invoice);
                await printInvoice(invoice);
                statusLine = 'HTTP/1.1 200 OK\r\n';
              } catch (err) {
                console.error('Error during printing:', err);
                statusLine = 'HTTP/1.1 500 Internal Server Error\r\n';
              }
            } else {
              console.warn('POST request received but no body found.');
              statusLine = 'HTTP/1.1 400 Bad Request\r\n';
            }
          } else {
            console.warn('Invalid HTTP request format: missing header-body delimiter.');
            statusLine = 'HTTP/1.1 400 Bad Request\r\n';
          }
          const postResponse =
            statusLine +
            'Access-Control-Allow-Origin: *\r\n' +
            'Access-Control-Allow-Headers: Content-Type\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 0\r\n\r\n';
          socket.write(postResponse);
          return;
        }
        if (requestStr.startsWith('POST /ReturnToApp')) {
          setShowWebView(false);
          const returnResponse =
            'HTTP/1.1 200 OK\r\n' +
            'Access-Control-Allow-Origin: *\r\n' +
            'Access-Control-Allow-Headers: Content-Type, authorization\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 0\r\n\r\n';
          socket.write(returnResponse);
          return;
        }
        // Block unknown endpoints.
        const forbiddenResponse =
          'HTTP/1.1 403 Forbidden\r\n' +
          'Access-Control-Allow-Origin: *\r\n' +
          'Content-Type: text/plain\r\n' +
          'Content-Length: 0\r\n\r\n';
        socket.write(forbiddenResponse);
      });
      socket.on('error', (error: any) => {
        console.error('Socket error:', error);
      });
      socket.on('close', () => {
        console.log('Socket closed');
      });
    });
    tcpServer.listen({ port: 4000, host: '0.0.0.0' }, () => {
      console.log('TCP server listening on port 4000');
    });
    setServer(tcpServer);
    return () => {
      tcpServer.close();
      console.log('TCP server closed');
    };
  }, []);

  // Configuration screen: Only subdomain is set by the user.
  if (!internetSubdomain) {
    return (
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Faqja e internetit</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.subdomainInput}
            value={subdomainInput}
            onChangeText={setSubdomainInput}
            placeholder="Shkruaj subdomainin"
          />
          <Text style={styles.domainSuffix}>.iva.al</Text>
        </View>
        <Button
          title="Ruaj"
          onPress={async () => {
            const fullDomain = subdomainInput.trim() + '.ivaelektronik.com';
            setInternetSubdomain(fullDomain);
            try {
              await AsyncStorage.setItem('internetSubdomain', fullDomain);
              await AsyncStorage.setItem('printerWidth', printerWidth);
            } catch (err) {
              console.error('Error saving configuration:', err);
            }
          }}
        />
      </View>
    );
  }

  // Render either the WebView or the main screen.
  return (
    <>
      {showWebView ? (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            <WebView
              source={{ uri: `${internetSubdomain}` }}
              style={{ flex: 1 }}
              userAgent="WebPOS-Mobile-WebView"
              onLoadStart={() => {
                if (!hasWebviewLoaded) {
                  setWebviewLoading(true);
                  webviewTimeoutRef.current = setTimeout(() => {
                    setWebviewLoading(false);
                  }, 10000);
                }
              }}
              onLoadEnd={() => {
                if (!hasWebviewLoaded) {
                  setHasWebviewLoaded(true);
                }
                if (webviewTimeoutRef.current) {
                  clearTimeout(webviewTimeoutRef.current);
                  webviewTimeoutRef.current = null;
                }
                setWebviewLoading(false);
              }}
            />
            {webviewLoading && (
              <ActivityIndicator
                size="large"
                color="#0000ff"
                style={styles.webviewSpinner}
              />
            )}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>BLE PRINTER</Text>
          <Button
            title="Scan BLE Devices"
            onPress={scanDevices}
          />
          <View style={styles.spacing} />
          {(!connectedDevice && !connecting) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Discovered BLE Devices</Text>
              <FlatList
                data={devices}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => handleConnect(item)} style={styles.deviceItem}>
                    <Text style={styles.deviceText}>{item.name}</Text>
                    <Text style={styles.deviceAddress}>{item.id}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No BLE devices found.</Text>}
              />
              <Button title="Rescan Devices" onPress={scanDevices} color="#4CAF50" />
            </View>
          )}
          {connecting && (
            <ActivityIndicator size="large" color="#0000ff" style={{ marginVertical: 20 }} />
          )}
          {connectedDevice && (
            <View style={styles.connectedSection}>
              <Text style={styles.connectedText}>Connected to {connectedDevice.name}</Text>
              <View style={styles.buttonContainer}>
                <Button title="Print Test Invoice" onPress={printTestMessage} color="#2196F3" />
              </View>
              <View style={styles.buttonContainer}>
                <Button title="Disconnect" onPress={disconnectFromDevice} color="#f44336" />
              </View>
            </View>
          )}
          <View style={styles.configSection}>
            {editingPrinterWidth ? (
              <View style={{ width: '100%' }}>
                <TextInput
                  style={styles.input}
                  value={printerWidth}
                  onChangeText={setPrinterWidth}
                  placeholder="Shkruaj gjerësinë e re"
                  keyboardType="numeric"
                />
                <Button
                  title="Save Printer Width"
                  onPress={async () => {
                    try {
                      await AsyncStorage.setItem('printerWidth', printerWidth);
                      setEditingPrinterWidth(false);
                      console.log("Printer width updated to:", printerWidth);
                    } catch (err) {
                      console.error("Error updating printer width", err);
                    }
                  }}
                />
              </View>
            ) : (
              <View style={styles.buttonContainer}>
                <Button title="Change Printer Width" onPress={() => setEditingPrinterWidth(true)} />
              </View>
            )}
          </View>
        </ScrollView>
      )}
      {connecting && (
        <Modal
          visible={connecting}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.modalBackground}>
            <View style={styles.activityIndicatorWrapper}>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text>Connecting...</Text>
            </View>
          </View>
        </Modal>
      )}
      {printing && (
        <Modal
          visible={printing}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.modalBackground}>
            <View style={styles.activityIndicatorWrapper}>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text>Printing invoice...</Text>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    minHeight: '100%',
  },
  spacing: {
    height: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  inputContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F5F5F5',
  },
  inputLabel: {
    fontSize: 18,
    marginBottom: 10,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  subdomainInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    width: 120,
    marginRight: 8,
    borderRadius: 4,
  },
  domainSuffix: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  section: {
    width: '100%',
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  deviceItem: {
    padding: 10,
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
  },
  deviceText: {
    fontSize: 16,
    color: '#333',
  },
  deviceAddress: {
    fontSize: 12,
    color: '#888',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginVertical: 10,
  },
  connectedSection: {
    width: '100%',
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  connectedText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#4CAF50',
  },
  buttonContainer: {
    width: '70%',
    marginVertical: 5,
  },
  configSection: {
    width: '100%',
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  configText: {
    fontSize: 16,
    marginBottom: 10,
    color: '#555',
    textAlign: 'center',
  },
  modalBackground: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  activityIndicatorWrapper: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  webviewSpinner: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -25,
    marginTop: -25,
  },
});

export default App;
