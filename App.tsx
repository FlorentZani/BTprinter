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
} from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import RNBluetoothClassic, { BluetoothDevice as RNBluetoothDevice } from 'react-native-bluetooth-classic';
import { addBreaks, centerText, dottedLine, printQRCode, textWithHeadingSize, boldText } from './escpos-commands';
import { formatInvoice, Invoice } from './InvoiceFormatter'; // invoiceFormatter.ts should export an Invoice interface and formatInvoice
import { Buffer } from 'buffer';

global.Buffer = Buffer;

interface BluetoothDevice {
  address: string;
  name: string;
  // Other properties as needed
}

const App: React.FC = () => {
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

  // Print a test message using a fixed command sequence
  const printTestMessage = async (): Promise<void> => {
    if (!connectedDeviceRef.current) {
      console.warn('No Bluetooth device connected');
      return;
    }
    // For testing, we'll print a centered, bold header with a dotted line and a QR code.
    const commands =
      centerText() +
      addBreaks(1) +
      dottedLine(48) +
      addBreaks(1) +
      printQRCode("https://example.com", 7) +
      addBreaks(2);
    try {
      await RNBluetoothClassic.writeToDevice(
        connectedDeviceRef.current.address,
        Buffer.from("Test ë Ä Ö Ü é ü", "latin1")
      );
      console.log('Printed test message');
    } catch (e) {
      console.error('Printing failed:', e);
    }
  };

  /**
   * Print invoice received from an HTTP POST request.
   * The invoice JSON object may have all properties optional.
   */
  const printInvoice = async (invoice: Invoice): Promise<void> => {
    if (!connectedDeviceRef.current) {
      console.warn('No Bluetooth device connected');
      return;
    }
    try {
      // formatInvoice builds the ESC/POS command string from the invoice JSON.
      let commands = formatInvoice(invoice);
    
      // Convert the string to a Buffer with UTF-8 encoding
      let encodedCommands = Buffer.from(commands, 'latin1');
    
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
    <View style={styles.container}>
      <Text style={styles.title}>Mobile HTTP Server with Bluetooth Printing</Text>
      <FlatList
        data={devices}
        keyExtractor={(item) => item.address}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => connectToDevice(item)}
            style={{ marginVertical: 10 }}
          >
            <Text>{item.name} - {item.address}</Text>
          </TouchableOpacity>
        )}
      />
      {connectedDeviceRef.current && (
        <View style={{ marginTop: 20 }}>
          <Text>Connected to {connectedDeviceRef.current.name}</Text>
          <Button title="Print Test" onPress={printTestMessage} />
        </View>
      )}
      <Button title="Refresh Devices" onPress={listPairedDevices} />
      <Text style={styles.info}>
        TCP server listening on port 4000. Send HTTP POST requests to http://192.168.0.198:4000/print.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, marginBottom: 20 },
  info: { marginTop: 20, textAlign: 'center' },
});

export default App;
