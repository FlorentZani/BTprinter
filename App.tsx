import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Button,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import RNBluetoothClassic, { BluetoothDevice as RNBluetoothDevice } from 'react-native-bluetooth-classic';
import { addBreaks, centerText, dottedLine, printQRCode, boldText } from './escpos-commands';
import { formatInvoice, Invoice } from './InvoiceFormatter';
import { Buffer } from 'buffer';
import { NetworkInfo } from 'react-native-network-info';

global.Buffer = Buffer;

interface BluetoothDevice {
  address: string;
  name: string;
  // Other properties as needed
}

const App: React.FC = () => {
  // Allow ipAddress to be null in case no IP is found.
  const [ipAddress, setIpAddress] = useState<string | null>('');
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const connectedDeviceRef = useRef<BluetoothDevice | null>(null);
  const [server, setServer] = useState<any>(null);

  // Update the ref whenever connectedDevice changes
  useEffect(() => {
    connectedDeviceRef.current = connectedDevice;
  }, [connectedDevice]);

  // Request Bluetooth permissions (for Android)
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

  // List paired devices
  const listPairedDevices = async (): Promise<void> => {
    try {
      const paired: RNBluetoothDevice[] = await RNBluetoothClassic.getBondedDevices();
      setDevices(paired as BluetoothDevice[]);
    } catch (e) {
      console.error('Error listing paired devices:', e);
    }
  };

  // Connect to a selected Bluetooth device
  const connectToDevice = async (device: BluetoothDevice): Promise<void> => {
    try {
      const connected = await RNBluetoothClassic.connectToDevice(device.address);
      if (connected) {
        setConnectedDevice(connected as BluetoothDevice);
        console.log('Connected to:', device.name);
      }
    } catch (e) {
      console.error('Connection failed:', e);
    }
  };

  // Print invoice received (used by the TCP server)
  const printInvoice = async (invoice: Invoice): Promise<void> => {
    if (!connectedDeviceRef.current) {
      console.warn('No Bluetooth device connected');
      return;
    }
    try {
      // Generate the ESC/POS commands from the invoice
      let commands = formatInvoice(invoice);
      // Prepend the printer configuration with the device's private IP (or a fallback)
      const printerConfig = "Konfiguruesi i printerit : " + (ipAddress || 'Nuk u gjet') + "\n";
      const fullCommands = printerConfig + commands;

      const encodedCommands = Buffer.from(fullCommands, 'latin1');

      console.log('Printing invoice with commands (first 100 chars):', encodedCommands.slice(0, 100));

      await RNBluetoothClassic.writeToDevice(
        connectedDeviceRef.current.address,
        encodedCommands
      );

      console.log('Printed invoice successfully');
    } catch (error) {
      console.error('Printing invoice failed:', error);
    }
  };

  // Print a test invoice using sample data (similar to your provided JSON)
  const printTestMessage = async (): Promise<void> => {
    if (!connectedDeviceRef.current) {
      console.warn('No Bluetooth device connected');
      return;
    }
    const sampleInvoice: Invoice = {
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
        {
          productName: "qumesht",
          quantity: 0,
          price: 0,
          fullPrice: 0,
          discountAmount: 0,
          uom: "Cope"
        },
        {
          productName: "qumesht",
          quantity: 0,
          price: 0,
          fullPrice: 0,
          discountAmount: 0,
          uom: "Cope"
        }
      ],
      totalPriceNoVat: 0,
      vat: [
        {
          vatType: "Standard",
          amount: 0
        }
      ],
      totalDiscount: 0,
      totalPrice: 0,
      Exrate: 0,
      CustomerName: "John Doe",
      CustomerTin: "987654321",
      CustomerContact: "555-1234",
      CustomerAddress: "456 Other St",
      qrCode: "https://example.com/invoice/123",
      qrSize: 8,
      IIC: "IICDATA",
      FIC: "FICDATA",
      Footer: "Thank you for your purchase!"
    };

    // Use the same process as printInvoice
    printInvoice(sampleInvoice);
  };

  // Handler for the "configure printer" button
  const handleConfigurePrinter = () => {
    console.log("Kliko ketu per te shtuar konfigurimin e printerit");
    // Add your printer configuration logic here
  };

  // Handler for the button that opens a web page
  const handleGoToPage = () => {
    Linking.openURL('https://www.example.com').catch(err =>
      console.error("Failed to open page:", err)
    );
  };

  // Get the device's private IP address
  useEffect(() => {
    NetworkInfo.getIPAddress().then(ip => {
      setIpAddress(ip || 'Nuk u gjet');
      console.log('Device IP address:', ip);
    });
  }, []);

  // Set up the TCP server to listen for HTTP POST requests (runs once on mount)
  useEffect(() => {
    requestBluetoothPermissions();
    listPairedDevices();

    const tcpServer = TcpSocket.createServer((socket: any) => {
      console.log('Client connected');

      socket.on('data', (data: string | Buffer) => {
        // Ensure we have a UTF-8 string representation of the incoming data
        const requestStr = typeof data === 'string' ? data : data.toString('utf8');
        console.log('Received request:\n', requestStr);

        // Check if the request is a POST to /print
        if (requestStr.startsWith('POST /print')) {
          const delimiter = '\r\n\r\n';
          const bodyIndex = requestStr.indexOf(delimiter);
          if (bodyIndex >= 0) {
            const body = requestStr.slice(bodyIndex + delimiter.length).trim();
            if (body) {
              try {
                // Attempt to parse the JSON body
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
          const response =
            'HTTP/1.1 200 OK\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 2\r\n\r\nOK';
          socket.write(response);
        } else {
          const response =
            'HTTP/1.1 200 OK\r\n' +
            'Content-Type: text/plain\r\n' +
            'Content-Length: 19\r\n\r\nHello from mobile!';
          socket.write(response);
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
  }, []); // Run once on mount

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>BLUETOOTH PRINTER</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Paired Bluetooth Devices</Text>
        <FlatList
          data={devices}
          keyExtractor={(item) => item.address}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => connectToDevice(item)}
              style={styles.deviceItem}
            >
              <Text style={styles.deviceText}>{item.name}</Text>
              <Text style={styles.deviceAddress}>{item.address}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No paired devices found.</Text>}
        />
        <Button title="Refresh Devices" onPress={listPairedDevices} color="#4CAF50" />
      </View>

      {connectedDevice && (
        <View style={styles.connectedSection}>
          <Text style={styles.connectedText}>Connected to {connectedDevice.name}</Text>
          <Button title="Print Test Invoice" onPress={printTestMessage} color="#2196F3" />
        </View>
      )}

      {/* Configuration section moved to the bottom */}
      <View style={styles.configSection}>
        <Text style={styles.configText}>
          Konfiguruesi i printerit: {ipAddress || 'Nuk u gjet'}
        </Text>
        <Button
          title="Kliko ketu per te shtuar konfigurimin e printerit"
          onPress={handleGoToPage}
          color="#FF5722"
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    minHeight: '100%',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  ipText: {
    fontSize: 16,
    marginBottom: 20,
    color: '#555',
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
});

export default App;
