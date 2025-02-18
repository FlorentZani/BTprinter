// BluetoothDeviceSelector.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Button, StyleSheet } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';

interface BluetoothDevice {
  address: string;
  name: string;
  // Add other properties if needed
}

interface Props {
  onConnect: (device: BluetoothDevice) => void;
}

const BluetoothDeviceSelector: React.FC<Props> = ({ onConnect }) => {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const listPairedDevices = async () => {
    try {
      setRefreshing(true);
      const bondedDevices: BluetoothDevice[] = await RNBluetoothClassic.getBondedDevices();
      setDevices(bondedDevices);
    } catch (error) {
      console.error('Error listing paired devices:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    listPairedDevices();
  }, []);

  const connectToDevice = async (device: BluetoothDevice) => {
    try {
      const connectedDevice = await RNBluetoothClassic.connectToDevice(device.address);
      if (connectedDevice) {
        console.log('Connected to:', device.name);
        onConnect(connectedDevice);
      }
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Select a Bluetooth Device</Text>
      <FlatList
        data={devices}
        keyExtractor={(item) => item.address}
        refreshing={refreshing}
        onRefresh={listPairedDevices}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.deviceItem} onPress={() => connectToDevice(item)}>
            <Text style={styles.deviceName}>{item.name || 'Unnamed Device'}</Text>
            <Text style={styles.deviceAddress}>{item.address}</Text>
          </TouchableOpacity>
        )}
      />
      <Button title="Refresh Devices" onPress={listPairedDevices} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', padding: 10 },
  header: { fontSize: 18, marginBottom: 10, textAlign: 'center' },
  deviceItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  deviceName: { fontSize: 16 },
  deviceAddress: { fontSize: 14, color: '#555' },
});

export default BluetoothDeviceSelector;
