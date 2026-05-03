import React from 'react'
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAlerts } from '../lib/AlertContext'
import { theme } from '../theme'

export function GlobalAlertModal() {
  const { showActiveAlertModal, setShowActiveAlertModal, currentActiveAlert } = useAlerts()

  if (!currentActiveAlert) return null

  return (
    <Modal
      visible={showActiveAlertModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowActiveAlertModal(false)}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={[modalStyles.header, { backgroundColor: currentActiveAlert.severity === 'high' ? '#ef4444' : '#f59e0b' }]}>
            <Ionicons name={currentActiveAlert.type === 'earthquake' ? 'pulse' : 'water'} size={32} color="#fff" />
            <Text style={modalStyles.headerTitle}>{currentActiveAlert.type.toUpperCase()} ALERT</Text>
          </View>

          <View style={modalStyles.body}>
            <Text style={modalStyles.alertTitle}>{currentActiveAlert.title}</Text>
            <Text style={modalStyles.alertMeta}>
              {currentActiveAlert.magnitude && `Magnitude: ${currentActiveAlert.magnitude} | `}
              {new Date(currentActiveAlert.time).toLocaleString()}
            </Text>

            <View style={modalStyles.divider} />

            <ScrollView style={{ maxHeight: 200 }}>
              <Text style={modalStyles.alertDescription}>
                {currentActiveAlert.description || currentActiveAlert.place || 'Emergency alert detected. Please stay safe and follow official instructions.'}
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[modalStyles.closeButton, { backgroundColor: currentActiveAlert.severity === 'high' ? '#ef4444' : '#f59e0b' }]}
              onPress={() => setShowActiveAlertModal(false)}
            >
              <Text style={modalStyles.closeButtonText}>ACKNOWLEDGE & CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 9999,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  header: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  body: {
    padding: 24,
  },
  alertTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertMeta: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 16,
  },
  alertDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    marginBottom: 20,
  },
  closeButton: {
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
})
