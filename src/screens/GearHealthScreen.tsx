import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { Card } from '../components/Card';
import { useStore } from '../store/useStore';
import { Plus, Activity, AlertCircle } from 'lucide-react-native';
import { ProgressBar } from '../components/ProgressBar';

export default function GearHealthScreen() {
  const { shoes, injuries, addShoe, addInjury } = useStore();
  const [shoeName, setShoeName] = useState('');
  const [shoeBrand, setShoeBrand] = useState('');
  const [injuryType, setInjuryType] = useState('');

  const handleAddShoe = () => {
    if (!shoeName || !shoeBrand) return;
    addShoe({ id: Date.now().toString(), name: shoeName, brand: shoeBrand, distance: 0 });
    setShoeName('');
    setShoeBrand('');
    Alert.alert('Success', 'Shoe added!');
  };

  const handleAddInjury = () => {
    if (!injuryType) return;
    addInjury({ id: Date.now().toString(), type: injuryType, severity: 'Medium', date: new Date().toISOString() });
    setInjuryType('');
    Alert.alert('Success', 'Injury logged. AI Coach will adjust plans accordingly.');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <View style={styles.header}>
          <Typography variant="h2">Gear & Health</Typography>
        </View>

        <View style={styles.section}>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 16}}>
            <Activity color={theme.colors.primary} size={24} style={{marginRight: 8}}/>
            <Typography variant="h3">Shoe Mileage</Typography>
          </View>

          {shoes.map(shoe => (
             <Card key={shoe.id} style={{marginBottom: 12}}>
               <Typography variant="label">{shoe.brand}</Typography>
               <Typography variant="h3" style={{marginVertical: 4}}>{shoe.name}</Typography>
               <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
                 <Typography variant="caption">{shoe.distance} km</Typography>
                 <Typography variant="caption" color={shoe.distance > 500 ? theme.colors.error : theme.colors.textSecondary}>500 km limit</Typography>
               </View>
               <ProgressBar progress={Math.min((shoe.distance / 500) * 100, 100)} color={shoe.distance > 500 ? theme.colors.error : theme.colors.success} />
             </Card>
          ))}

          <Card style={{marginTop: 8, backgroundColor: theme.colors.background}}>
            <TextInput
              style={styles.input}
              value={shoeBrand}
              onChangeText={setShoeBrand}
              placeholder="Brand (e.g. Nike)"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TextInput
              style={styles.input}
              value={shoeName}
              onChangeText={setShoeName}
              placeholder="Model (e.g. Alphafly)"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TouchableOpacity style={styles.button} onPress={handleAddShoe}>
              <Plus size={16} color="#fff" />
              <Typography weight="bold" style={{marginLeft: 8}}>Add Shoe</Typography>
            </TouchableOpacity>
          </Card>
        </View>

        <View style={styles.section}>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 16}}>
            <AlertCircle color={theme.colors.error} size={24} style={{marginRight: 8}}/>
            <Typography variant="h3">Injury Log</Typography>
          </View>

          {injuries.map(inj => (
             <Card key={inj.id} style={{marginBottom: 12, borderLeftWidth: 4, borderLeftColor: theme.colors.error}}>
               <Typography variant="h3">{inj.type}</Typography>
               <Typography variant="caption" style={{marginTop: 4}}>Logged: {new Date(inj.date).toLocaleDateString()}</Typography>
             </Card>
          ))}

          <Card style={{marginTop: 8, backgroundColor: theme.colors.background}}>
            <TextInput
              style={styles.input}
              value={injuryType}
              onChangeText={setInjuryType}
              placeholder="Describe pain/injury (e.g. Right knee ache)"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.error }]} onPress={handleAddInjury}>
              <AlertCircle size={16} color="#fff" />
              <Typography weight="bold" style={{marginLeft: 8}}>Log Issue</Typography>
            </TouchableOpacity>
          </Card>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  header: {
    marginBottom: theme.spacing.xl,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    marginBottom: 8,
  },
  button: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: theme.borderRadius.sm,
    marginTop: 4,
  }
});
