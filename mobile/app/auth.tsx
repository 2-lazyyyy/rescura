import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme } from '../src/theme'
import { useSession } from '../src/lib/session'

// ── Reusable input field ────────────────────────────────────────────────────
function FloatingInput({
  label,
  value,
  onChangeText,
  icon,
  placeholder,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  returnKeyType,
  onSubmitEditing,
  inputRef,
}: {
  label: string
  value: string
  onChangeText: (t: string) => void
  icon: keyof typeof Ionicons.glyphMap
  placeholder?: string
  keyboardType?: any
  autoCapitalize?: any
  secureTextEntry?: boolean
  returnKeyType?: any
  onSubmitEditing?: () => void
  inputRef?: React.RefObject<TextInput | null>
}) {
  const [focused, setFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isPassword = secureTextEntry

  const internalRef = useRef<TextInput>(null)
  const combinedRef = (inputRef as React.RefObject<TextInput>) || internalRef

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => combinedRef.current?.focus()}
      style={[inputStyles.wrap, focused && inputStyles.wrapFocused, value && !focused && inputStyles.wrapFilled]}
    >
      <View style={inputStyles.iconWrap}>
        <Ionicons name={icon} size={20} color={focused ? theme.colors.primary : theme.colors.mutedForeground} />
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          pointerEvents="none"
          style={[
            inputStyles.floatLabel,
            (focused || value) ? inputStyles.floatLabelActive : inputStyles.floatLabelHidden
          ]}
        >
          {label}
        </Text>
        <TextInput
          ref={combinedRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={focused || value ? '' : label}
          placeholderTextColor={theme.colors.mutedForeground}
          style={inputStyles.field}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          secureTextEntry={isPassword && !showPassword}
          returnKeyType={returnKeyType ?? 'next'}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          blurOnSubmit={false}
        />
      </View>
      {isPassword && (
        <TouchableOpacity
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={inputStyles.eyeBtn}
        >
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={theme.colors.mutedForeground}
          />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

const inputStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 16,
    minHeight: 60,
    gap: 12,
  },
  wrapFocused: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.background,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  wrapFilled: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  iconWrap: { width: 24, alignItems: 'center', flexShrink: 0 },
  floatLabel: {
    position: 'absolute',
    left: 0,
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  floatLabelActive: {
    top: 6,
    opacity: 1,
  },
  floatLabelHidden: {
    top: 20,
    opacity: 0,
  },
  field: {
    fontSize: 16,
    color: theme.colors.foreground,
    paddingTop: 18,
    paddingBottom: 8,
    minHeight: 52,
  },
  eyeBtn: { padding: 4 },
})

// ── Account type selector pill ──────────────────────────────────────────────
function AccountTypePill({
  type,
  label,
  icon,
  selected,
  onPress,
}: {
  type: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  selected: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[pillStyles.pill, selected && pillStyles.pillActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={18} color={selected ? theme.colors.primaryForeground : theme.colors.mutedForeground} />
      <Text style={[pillStyles.label, selected && pillStyles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

const pillStyles = StyleSheet.create({
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.card,
  },
  pillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  label: { fontWeight: '700', fontSize: 14, color: theme.colors.mutedForeground },
  labelActive: { color: theme.colors.primaryForeground },
})

// ── Main Auth Screen ────────────────────────────────────────────────────────
export default function AuthScreen() {
  const { login, register, isHydrating } = useSession()
  const insets = useSafeAreaInsets()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [accountType, setAccountType] = useState<'user' | 'organization'>('user')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Refs for return-key navigation
  const emailRef  = useRef<TextInput>(null)
  const phoneRef  = useRef<TextInput>(null)
  const passRef   = useRef<TextInput>(null)

  // ── Shake animation for error ──
  const shakeAnim = useRef(new Animated.Value(0)).current
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]).start()
  }

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setName(''); setEmail(''); setPhone(''); setPassword('')
  }

  const validate = () => {
    if (mode === 'register' && !name.trim()) {
      Alert.alert('Name required', 'Please enter your full name.'); shake(); return false
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.'); shake(); return false
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Password must be at least 6 characters.'); shake(); return false
    }
    return true
  }

  const submit = async () => {
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const result = mode === 'login'
        ? await login(email.trim(), password, accountType)
        : await register({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password, accountType })

      if (!result.success) {
        Alert.alert('Authentication failed', result.error || 'Please try again')
        shake()
        return
      }
      router.replace('/(tabs)')
    } catch (error) {
      Alert.alert('Authentication failed', error instanceof Error ? error.message : 'Please try again')
      shake()
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLoginReady    = email.trim() && password.length >= 6
  const isRegisterReady = name.trim() && email.trim() && password.length >= 6

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32, paddingTop: insets.top + 60 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ===== Back Button for Anonymous ===== */}
        <TouchableOpacity
          style={[styles.backFloatBtn, { top: insets.top + 10 }]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.foreground} />
          <Text style={styles.backFloatText}>Home</Text>
        </TouchableOpacity>
        {/* ===== Brand Header ===== */}
        <View style={styles.brandArea}>
          <LinearGradient colors={[theme.colors.primary, '#7c3aed']} style={styles.logoWrap}>
            <Ionicons name="shield-checkmark" size={36} color="#fff" />
          </LinearGradient>
          <Text style={styles.brandName}>Rescura</Text>
          <Text style={styles.brandTagline}>
            {mode === 'login' ? 'Welcome back 👋' : 'Join the rescue network 🌟'}
          </Text>
        </View>

        {/* ===== Card ===== */}
        <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>

          {/* Mode switcher tabs */}
          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'login' && styles.modeTabActive]}
              onPress={() => switchMode('login')}
            >
              <Text style={[styles.modeTabText, mode === 'login' && styles.modeTabTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'register' && styles.modeTabActive]}
              onPress={() => switchMode('register')}
            >
              <Text style={[styles.modeTabText, mode === 'register' && styles.modeTabTextActive]}>Create Account</Text>
            </TouchableOpacity>
          </View>

          {/* Account type selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account type</Text>
            <View style={styles.pillRow}>
              <AccountTypePill
                type="user"
                label="User"
                icon="person-outline"
                selected={accountType === 'user'}
                onPress={() => setAccountType('user')}
              />
              <AccountTypePill
                type="organization"
                label="Organization"
                icon="business-outline"
                selected={accountType === 'organization'}
                onPress={() => setAccountType('organization')}
              />
            </View>
          </View>

          {/* Fields */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {mode === 'login' ? 'Your credentials' : 'Your details'}
            </Text>
            <View style={styles.fields}>
              {mode === 'register' && (
                <FloatingInput
                  label="Full name"
                  value={name}
                  onChangeText={setName}
                  icon="person-outline"
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
              )}
              <FloatingInput
                label="Email address"
                value={email}
                onChangeText={setEmail}
                icon="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
                inputRef={emailRef}
                onSubmitEditing={() => mode === 'register' ? phoneRef.current?.focus() : passRef.current?.focus()}
              />
              {mode === 'register' && (
                <FloatingInput
                  label="Phone number (optional)"
                  value={phone}
                  onChangeText={setPhone}
                  icon="call-outline"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  returnKeyType="next"
                  inputRef={phoneRef}
                  onSubmitEditing={() => passRef.current?.focus()}
                />
              )}
              <FloatingInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                icon="lock-closed-outline"
                secureTextEntry
                returnKeyType="done"
                inputRef={passRef}
                onSubmitEditing={submit}
              />
            </View>
          </View>

          {/* Password strength hint on register */}
          {mode === 'register' && password.length > 0 && (
            <View style={styles.strengthRow}>
              {[1, 2, 3, 4].map((bar) => (
                <View
                  key={bar}
                  style={[
                    styles.strengthBar,
                    {
                      backgroundColor:
                        password.length >= bar * 3
                          ? password.length >= 12
                            ? '#059669'
                            : password.length >= 8
                              ? '#f59e0b'
                              : '#ef4444'
                          : theme.colors.border,
                    },
                  ]}
                />
              ))}
              <Text style={styles.strengthLabel}>
                {password.length < 6 ? 'Too short' : password.length < 8 ? 'Weak' : password.length < 12 ? 'Good' : 'Strong'}
              </Text>
            </View>
          )}

          {/* Submit button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!isSubmitting && (mode === 'login' ? !isLoginReady : !isRegisterReady)) && styles.submitBtnDisabled,
            ]}
            onPress={submit}
            disabled={isSubmitting || isHydrating}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={theme.colors.primary ? [theme.colors.primary, '#7c3aed'] : ['#6d28d9', '#7c3aed']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={mode === 'login' ? 'log-in-outline' : 'person-add-outline'}
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.submitText}>
                    {mode === 'login' ? 'Sign in' : 'Create account'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Switch mode link */}
          <TouchableOpacity
            style={styles.switchLink}
            onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}
          >
            <Text style={styles.switchLinkText}>
              {mode === 'login'
                ? "Don't have an account? "
                : 'Already have an account? '}
              <Text style={styles.switchLinkAccent}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Footer */}
        <Text style={[styles.footer, { marginBottom: 8 }]}>
          Rescura · Emergency Response Network
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, justifyContent: 'center', gap: 28 },

  // Brand
  brandArea: { alignItems: 'center', gap: 12 },
  logoWrap:  {
    width: 80,
    height: 80,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  brandName:    { fontSize: 32, fontWeight: '900', color: theme.colors.foreground, letterSpacing: -1 },
  brandTagline: { fontSize: 16, color: theme.colors.mutedForeground, textAlign: 'center' },

  // Card
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 28,
    padding: 24,
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },

  // Mode tabs
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 13,
  },
  modeTabActive: {
    backgroundColor: theme.colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  modeTabText:       { fontSize: 14, fontWeight: '700', color: theme.colors.mutedForeground },
  modeTabTextActive: { color: theme.colors.foreground },

  // Section
  section:      { gap: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  pillRow:      { flexDirection: 'row', gap: 12 },
  fields:       { gap: 12 },

  // Strength bar
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.mutedForeground, minWidth: 44, textAlign: 'right' },

  // Submit
  submitBtn:         { borderRadius: 18, overflow: 'hidden', marginTop: 4 },
  submitBtnDisabled: { opacity: 0.55 },
  submitGradient:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  submitText:        { color: '#fff', fontWeight: '800', fontSize: 17 },

  // Switch link
  switchLink:       { alignItems: 'center', paddingVertical: 4 },
  switchLinkText:   { fontSize: 14, color: theme.colors.mutedForeground },
  switchLinkAccent: { color: theme.colors.primary, fontWeight: '700' },

  // Footer
  footer: { textAlign: 'center', fontSize: 12, color: theme.colors.mutedForeground },

  // Back float
  backFloatBtn: {
    position: 'absolute',
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 10,
  },
  backFloatText: { fontWeight: '700', fontSize: 14, color: theme.colors.foreground },
})