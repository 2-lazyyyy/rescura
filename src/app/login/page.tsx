'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  LogIn,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react'
import { useLanguage } from '@/hooks/use-language'
import { useAuth } from '@/hooks/use-auth'
import { validateEmail, validateLength } from '@/lib/validation'

export default function LoginPage() {
  const { t } = useLanguage()
  const { login, isLoading } = useAuth()
  const router = useRouter()

  type AccountType = 'user' | 'organization'
  const [loginForm, setLoginForm] = useState({
    accountType: 'user' as AccountType,
    email: '',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Validate email field
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

  // Validate password field
  const validatePasswordField = (password: string) => {
    const result = validateLength(password, { min: 1, fieldName: 'Password' })
    if (!result.valid) {
      setFieldErrors(prev => ({ ...prev, password: result.error || 'Password is required' }))
      return false
    }
    setFieldErrors(prev => {
      const newErrors = { ...prev }
      delete newErrors.password
      return newErrors
    })
    return true
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    // Validate all fields
    let isValid = true
    isValid = validateEmailField(loginForm.email) && isValid
    isValid = validatePasswordField(loginForm.password) && isValid

    if (!isValid) {
      setError('Please fix the errors below')
      return
    }

    const result = await login(loginForm.email, loginForm.password, loginForm.accountType)

    if (result.success) {
      router.push('/')
    } else {
      setError(result.error || 'Login failed')
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setLoginForm(prev => ({
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
    if (name === 'email') {
      validateEmailField(value)
    } else if (name === 'password') {
      validatePasswordField(value)
    }
  }

  const handleAccountTypeChange = (value: AccountType | string) => {
    if (!value) return
    setLoginForm(prev => ({ ...prev, accountType: value as AccountType }))
    setError('')
    setFieldErrors({})
  }

  // Check if form is valid
  const isFormValid = useMemo(() => {
    return loginForm.email.trim() !== '' && loginForm.password.trim() !== '' && Object.keys(fieldErrors).length === 0
  }, [loginForm, fieldErrors])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
              <img
                src="/rescura-logo.png"
                alt="Rescura"
                className="h-16 w-auto [clip-path:polygon(50%_0%,_100%_20%,_100%_75%,_50%_100%,_0%_75%,_0%_20%)]"
              />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Rescura</h1>
          <p className="text-gray-600">{t('auth.login')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">{t('auth.login')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2">
                <ToggleGroup
                  type="single"
                  value={loginForm.accountType}
                  onValueChange={handleAccountTypeChange}
                  className="w-full"
                >
                  <ToggleGroupItem value="user" className="flex-1">
                    <div className="flex flex-col items-center gap-1 py-1">
                      <span className="text-sm font-medium">User</span>
                    </div>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="organization" className="flex-1">
                    <div className="flex flex-col items-center gap-1 py-1">
                      <span className="text-sm font-medium">Organization</span>
                    </div>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className={fieldErrors.email ? 'text-red-500' : ''}>
                  {t('auth.email')} *
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={loginForm.email}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  placeholder="Enter email"
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

              <div className="space-y-2">
                <Label htmlFor="password" className={fieldErrors.password ? 'text-red-500' : ''}>
                  {t('auth.password')} *
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    placeholder="Enter password"
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

              <Button type="submit" className="w-full" disabled={isLoading || !isFormValid}>
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.loading')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    {t('auth.login')}
                  </div>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                {t('auth.dontHaveAccount')}{' '}
                <Link href="/register" className="text-blue-600 hover:underline">
                  {t('auth.register')}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}