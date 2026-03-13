'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { 
  UserPlus,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react'
import { useLanguage } from '@/hooks/use-language'
import { useAuth } from '@/hooks/use-auth'
import { 
  validateEmail, 
  validatePhone, 
  validatePassword, 
  validateName,
  validateAddress,
  validatePasswordMatch,
  validateLength
} from '@/lib/validation'

type AccountType = 'user' | 'organization'

interface RegisterFormState {
  accountType: AccountType
  name: string
  email: string
  phone: string
  address: string
  password: string
  confirmPassword: string
  agreeToTerms: boolean
}

export default function RegisterPage() {
  const { t } = useLanguage()
  const { register, isLoading } = useAuth()
  const router = useRouter()
  
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    accountType: 'user',
    name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Validate individual fields
  const validateNameField = (name: string) => {
    const fieldName = registerForm.accountType === 'organization' ? 'Organization Name' : 'Name'
    const result = validateName(name, fieldName)
    if (!result.valid) {
      setFieldErrors(prev => ({ ...prev, name: result.error || 'Invalid name' }))
      return false
    }
    setFieldErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.name
      return newErrors
    })
    return true
  }

  const validateEmailField = (email: string) => {
    const result = validateEmail(email)
    if (!result.valid) {
      setFieldErrors(prev => ({ ...prev, email: result.error || 'Invalid email' }))
      return false
    }
    setFieldErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.email
      return newErrors
    })
    return true
  }

  const validatePhoneField = (phone: string) => {
    const result = validatePhone(phone)
    if (!result.valid) {
      setFieldErrors(prev => ({ ...prev, phone: result.error || 'Invalid phone' }))
      return false
    }
    setFieldErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.phone
      return newErrors
    })
    return true
  }

  const validateAddressField = (address: string) => {
    const result = validateAddress(address)
    if (!result.valid) {
      setFieldErrors(prev => ({ ...prev, address: result.error || 'Invalid address' }))
      return false
    }
    setFieldErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.address
      return newErrors
    })
    return true
  }

  const validatePasswordField = (password: string) => {
    const result = validatePassword(password)
    if (!result.valid) {
      setFieldErrors(prev => ({ ...prev, password: result.error || 'Invalid password' }))
      return false
    }
    setFieldErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.password
      return newErrors
    })
    return true
  }

  const validateConfirmPasswordField = (confirmPassword: string) => {
    const result = validatePasswordMatch(registerForm.password, confirmPassword)
    if (!result.valid) {
      setFieldErrors(prev => ({ ...prev, confirmPassword: result.error || 'Passwords do not match' }))
      return false
    }
    setFieldErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.confirmPassword
      return newErrors
    })
    return true
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    
    // Validate all fields
    let isValid = true
    isValid = validateNameField(registerForm.name) && isValid
    isValid = validateEmailField(registerForm.email) && isValid
    isValid = validatePhoneField(registerForm.phone) && isValid
    isValid = validatePasswordField(registerForm.password) && isValid
    isValid = validateConfirmPasswordField(registerForm.confirmPassword) && isValid
    
    if (registerForm.accountType === 'organization') {
      isValid = validateAddressField(registerForm.address) && isValid
    }
    
    if (!registerForm.agreeToTerms) {
      setError('Please agree to the terms and conditions')
      isValid = false
    }

    if (!isValid) {
      setError('Please fix all errors below')
      return
    }
    
    const result = await register({
      accountType: registerForm.accountType,
      name: registerForm.name,
      email: registerForm.email,
      phone: registerForm.phone,
      password: registerForm.password,
      address: registerForm.accountType === 'organization' ? registerForm.address : undefined
    })
    
    if (result.success) {
      router.push('/')
    } else {
      setError(result.error || 'Registration failed')
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setRegisterForm(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error when user starts typing
    if (fieldErrors[name]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    if (name === 'name') validateNameField(value)
    else if (name === 'email') validateEmailField(value)
    else if (name === 'phone') validatePhoneField(value)
    else if (name === 'address') validateAddressField(value)
    else if (name === 'password') validatePasswordField(value)
    else if (name === 'confirmPassword') validateConfirmPasswordField(value)
  }

  const handleAccountTypeChange = (value: AccountType | string) => {
    if (!value) {
      return
    }
    setRegisterForm(prev => ({
      ...prev,
      accountType: value as AccountType
    }))
    setError('')
    setFieldErrors({})
  }

  // Check if form is valid
  const isFormValid = useMemo(() => {
    const hasName = registerForm.name.trim() !== ''
    const hasEmail = registerForm.email.trim() !== ''
    const hasPhone = registerForm.phone.trim() !== ''
    const hasPassword = registerForm.password.trim() !== ''
    const hasConfirmPassword = registerForm.confirmPassword.trim() !== ''
    const noErrors = Object.keys(fieldErrors).length === 0
    
    if (registerForm.accountType === 'organization') {
      const hasAddress = registerForm.address.trim() !== ''
      return hasName && hasEmail && hasPhone && hasPassword && hasConfirmPassword && hasAddress && registerForm.agreeToTerms && noErrors
    }
    
    return hasName && hasEmail && hasPhone && hasPassword && hasConfirmPassword && registerForm.agreeToTerms && noErrors
  }, [registerForm, fieldErrors])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/rescura-logo.svg" 
              alt="Rescura" 
              className="h-16 w-auto"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Rescura</h1>
          <p className="text-gray-600">{t('auth.register')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">{t('auth.createAccount')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="flex flex-col gap-2">
                <ToggleGroup
                  type="single"
                  value={registerForm.accountType}
                  onValueChange={handleAccountTypeChange}
                  className="w-full"
                >
                  <ToggleGroupItem value="user" className="flex-1">
                    <div className="flex items-center justify-center py-1">
                      <span className="text-sm font-medium">User</span>
                    </div>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="organization" className="flex-1">
                    <div className="flex items-center justify-center py-1">
                      <span className="text-sm font-medium">Organization</span>
                    </div>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className={fieldErrors.name ? 'text-red-500' : ''}>
                    {registerForm.accountType === 'organization' ? t('register.orgName') : t('auth.name')} *
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    value={registerForm.name}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    placeholder={t('register.enterFullName')}
                    className={fieldErrors.name ? 'border-red-500' : ''}
                    required
                  />
                  {fieldErrors.name && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {fieldErrors.name}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email" className={fieldErrors.email ? 'text-red-500' : ''}>
                    {t('auth.email')} *
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={registerForm.email}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    placeholder={t('register.enterEmail')}
                    className={fieldErrors.email ? 'border-red-500' : ''}
                    required
                  />
                  {fieldErrors.email && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {fieldErrors.email}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone" className={fieldErrors.phone ? 'text-red-500' : ''}>
                    {registerForm.accountType === 'organization' ? t('register.orgPhone') : t('auth.phone')} *
                  </Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={registerForm.phone}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    placeholder={
                      registerForm.accountType === 'organization'
                        ? t('register.enterOrgPhone')
                        : t('register.enterPhone')
                    }
                    className={fieldErrors.phone ? 'border-red-500' : ''}
                    required
                  />
                  {fieldErrors.phone && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {fieldErrors.phone}
                    </div>
                  )}
                </div>
              </div>

              {registerForm.accountType === 'organization' && (
                <div className="space-y-2">
                  <Label htmlFor="address" className={fieldErrors.address ? 'text-red-500' : ''}>
                    {t('register.orgAddress')} *
                  </Label>
                  <Input
                    id="address"
                    name="address"
                    type="text"
                    value={registerForm.address}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    placeholder={t('register.enterOrgAddress')}
                    className={fieldErrors.address ? 'border-red-500' : ''}
                    required
                  />
                  {fieldErrors.address && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {fieldErrors.address}
                    </div>
                  )}
                </div>
              )}
              
              {/* Removed role-based organization selection */}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className={fieldErrors.password ? 'text-red-500' : ''}>
                    {t('auth.password')} *
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={registerForm.password}
                      onChange={handleInputChange}
                      onBlur={handleBlur}
                      placeholder={t('register.enterPassword')}
                      className={fieldErrors.password ? 'border-red-500 pr-10' : 'pr-10'}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {fieldErrors.password && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {fieldErrors.password}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className={fieldErrors.confirmPassword ? 'text-red-500' : ''}>
                    Confirm Password *
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={registerForm.confirmPassword}
                      onChange={handleInputChange}
                      onBlur={handleBlur}
                      placeholder="Confirm password"
                      className={fieldErrors.confirmPassword ? 'border-red-500 pr-10' : 'pr-10'}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {fieldErrors.confirmPassword}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="terms"
                  checked={registerForm.agreeToTerms}
                  onCheckedChange={(checked) => setRegisterForm(prev => ({ ...prev, agreeToTerms: checked as boolean }))}
                />
                <Label htmlFor="terms" className="text-sm">
                  I agree to the terms and conditions and privacy policy
                </Label>
              </div>
              
              <Button type="submit" className="w-full" disabled={isLoading || !isFormValid}>
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.loading')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    {t('auth.createAccount')}
                  </div>
                )}
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                {t('auth.alreadyHaveAccount')}{' '}
                <Link href="/login" className="text-blue-600 hover:underline">
                  {t('auth.login')}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}