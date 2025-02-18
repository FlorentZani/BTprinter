// App.js
import { AppRegistry } from 'react-native';
import {name as appName} from './app.json';
import React, { useEffect, useState } from 'react';
import { View, Text, Button, FlatList, TouchableOpacity } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';

export default function App() {
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);

  // 1. List paired devices on mount
  useEffect(() => {
    listPairedDevices();
  }, []);

  const listPairedDevices = async () => {
    try {
      const paired = await RNBluetoothClassic.getBondedDevices();
      setDevices(paired);
    } catch (e) {
      console.error(e);
    }
  };

  // 2. Connect to a device
  const connectToDevice = async (device) => {
    try {
      const connected = await RNBluetoothClassic.connectToDevice(device.address);
      if (connected) {
        setConnectedDevice(connected);
        console.log('Connected to:', device.name);
      }
    } catch (e) {
      console.error('Connection failed:', e);
    }
  };

  // 3. Send text to print
  const printText = async () => {
    if (!connectedDevice) return;
    try {
      // Simple text
      await RNBluetoothClassic.writeToDevice(connectedDevice.address, 'Hello from React Native\n');
      // For ESC/POS commands, you'd write the raw command bytes instead
    } catch (e) {
      console.error('Printing failed:', e);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 20, marginBottom: 10 }}>Bluetooth Devices</Text>
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
      {connectedDevice && (
        <View style={{ marginTop: 20 }}>
          <Text>Connected to {connectedDevice.name}</Text>
          <Button title="Print Test" onPress={printText} />
        </View>
      )}
    </View>
  );
}
