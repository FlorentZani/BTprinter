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
import TcpSocket from 'react-native-tcp-socket';
import RNBluetoothClassic, { BluetoothDevice as RNBluetoothDevice } from 'react-native-bluetooth-classic';
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
import { formatInvoice, Invoice } from './InvoiceFormatter';

global.Buffer = Buffer;

interface BluetoothDevice {
  address: string;
  name: string;
}

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

  // WebView state and spinner.
  const [showWebView, setShowWebView] = useState<boolean>(false);
  const [webviewLoading, setWebviewLoading] = useState<boolean>(false);
  const [hasWebviewLoaded, setHasWebviewLoaded] = useState<boolean>(false);
  const webviewTimeoutRef = useRef<any>(null);

  // Other states.
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const connectedDeviceRef = useRef<BluetoothDevice | null>(null);
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
        const device = devices.find(d => d.address === lastConnected) || { address: lastConnected, name: 'Unknown Device' };
        connectToDeviceNow(device);
      }
    };
    tryReconnect();
  }, [devices]);

  useEffect(() => {
    connectedDeviceRef.current = connectedDevice;
  }, [connectedDevice]);

  // Automatically open the WebView when a printer gets connected.
  useEffect(() => {
    if (connectedDevice) {
      setShowWebView(true);
    }
  }, [connectedDevice]);

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

  const listPairedDevices = async (): Promise<void> => {
    try {
      const paired: RNBluetoothDevice[] = await RNBluetoothClassic.getBondedDevices();
      setDevices(paired as BluetoothDevice[]);
    } catch (e) {
      console.error('Error listing paired devices:', e);
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

  // Connect to a device; if connection fails, then disconnect.
  const connectToDeviceNow = async (device: BluetoothDevice): Promise<void> => {
    setConnecting(true);
    try {
      const connected = await RNBluetoothClassic.connectToDevice(device.address);
      if (connected) {
        setConnectedDevice(connected as BluetoothDevice);
        await AsyncStorage.setItem('lastConnectedDevice', device.address);
        console.log('Connected to:', device.name);
      } else {
        disconnectFromDevice();
      }
    } catch (e) {
      console.error('Connection failed:', e);
      disconnectFromDevice();
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect from the current device.
  const disconnectFromDevice = async () => {
    if (connectedDevice) {
      try {
        await RNBluetoothClassic.disconnectFromDevice(connectedDevice.address);
      } catch (e) {
        console.error("Error disconnecting", e);
      } finally {
        setConnectedDevice(null);
        await AsyncStorage.removeItem('lastConnectedDevice');
      }
    }
  };

  // Print invoice; if error occurs, disconnect and alert the user.
  const printInvoice = async (invoice: Invoice): Promise<void> => {
    if (!connectedDeviceRef.current) {
      Alert.alert("Not Connected", "No printer is connected.");
      return;
    }
    try {
      const width = parseInt(printerWidthRef.current, 10) || 48;
      console.log("Using printer width:", width);
      const commands = formatInvoice(invoice, width);
      const encodedCommands = Buffer.from(commands, 'latin1');
      console.log('Printing invoice (first 100 chars):', encodedCommands.slice(0, 100));
      await RNBluetoothClassic.writeToDevice(
        connectedDeviceRef.current.address,
        encodedCommands
      );
      console.log('Printed invoice successfully');
    } catch (error) {
      console.error('Printing invoice failed:', error);
      disconnectFromDevice();
      Alert.alert("Printer Disconnected", "The printer appears to be disconnected. Please reconnect.");
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
    requestBluetoothPermissions();
    listPairedDevices();
    const tcpServer = TcpSocket.createServer((socket: any) => {
      console.log('Client connected');
      socket.on('data', (data: string | Buffer) => {
        const requestStr = typeof data === 'string' ? data : data.toString('utf8');
        console.log('Received request:\n', requestStr);
        if (requestStr.startsWith('OPTIONS')) {
          const optionsResponse =
            'HTTP/1.1 204 No Content\r\n' +
            'Access-Control-Allow-Origin: *\r\n' +
            'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n' +
            'Access-Control-Allow-Headers: Content-Type\r\n' +
            'Content-Length: 0\r\n\r\n';
          socket.write(optionsResponse);
          return;
        }
        if (requestStr.startsWith('POST /print')) {
          const delimiter = '\r\n\r\n';
          const bodyIndex = requestStr.indexOf(delimiter);
          if (bodyIndex >= 0) {
            const body = requestStr.slice(bodyIndex + delimiter.length).trim();
            if (body) {
              try {
                const invoice: Invoice = JSON.parse(body);
                console.log('Invoice data received:', invoice);
                printInvoice(invoice);
              } catch (err) {
                console.error('Error parsing JSON body:', err);
              }
            } else {
              console.warn('POST request received but no body found.');
            }
          } else {
            console.warn('Invalid HTTP request format: missing header-body delimiter.');
          }
          const postResponse =
            'HTTP/1.1 200 OK\r\n' +
            'Access-Control-Allow-Origin: *\r\n' +
            'Access-Control-Allow-Headers: Content-Type\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 2\r\n\r\nOK';
          socket.write(postResponse);
        } else {
          const defaultResponse =
            'HTTP/1.1 200 OK\r\n' +
            'Access-Control-Allow-Origin: *\r\n' +
            'Access-Control-Allow-Headers: Content-Type\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 19\r\n\r\nHello from mobile!';
          socket.write(defaultResponse);
        }
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
            const fullDomain = subdomainInput.trim() + '.iva.al';
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
          <Button title="Kthehu tek aplikacioni" onPress={() => setShowWebView(false)} />
          <View style={{ flex: 1 }}>
            <WebView
              source={{ uri: `${internetSubdomain}` }}
              style={{ flex: 1 }}
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
          <Text style={styles.title}>BLUETOOTH PRINTER</Text>
          <Button
            title={`Hap Faqen Web (${internetSubdomain})`}
            onPress={() => setShowWebView(true)}
          />
          <View style={styles.spacing} />
          {(!connectedDevice && !connecting) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Paired Bluetooth Devices</Text>
              <FlatList
                data={devices}
                keyExtractor={(item) => item.address}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => handleConnect(item)} style={styles.deviceItem}>
                    <Text style={styles.deviceText}>{item.name}</Text>
                    <Text style={styles.deviceAddress}>{item.address}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>No paired devices found.</Text>}
              />
              <Button title="Refresh Devices" onPress={listPairedDevices} color="#4CAF50" />
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
              <View style ={styles.buttonContainer}>
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
