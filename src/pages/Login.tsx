import { useState, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MessageSquare, ArrowLeft } from 'lucide-react';
import { requestPasswordReset, verifyOTPAndSignIn } from '@/lib/customAuth';
import { sendOTPEmail, isEmailConfigured } from '@/lib/emailService';

type Mode = 'login' | 'signup' | 'forgot' | 'verify-otp';

export default function Login() {
  const { signInWithEmail, signUpWithEmail, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
      const { error } = await signInWithEmail(email, password);
      if (error) {
        setError(error);
        setLoading(false);
      } else {
        navigate(from, { replace: true });
      }
    } else {
      const { error, needsEmailConfirmation } = await signUpWithEmail(email, password);
      if (error) {
        setError(error);
        setLoading(false);
      } else if (needsEmailConfirmation) {
        // Email confirmation required — show "check email" screen
        setSignupDone(true);
        setLoading(false);
      } else {
        // Email confirmation is disabled — session created immediately, redirect
        navigate(from, { replace: true });
      }
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setInfo(null);
    setSignupDone(false);
    setPassword('');
    setConfirmPassword('');
    setOtpCode('');
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!forgotEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!isEmailConfigured()) {
      setError('Email service not configured. Ask your admin to set up EmailJS in Settings → Profile.');
      return;
    }

    setLoading(true);
    try {
      const { error: genError, otp } = await requestPasswordReset(forgotEmail);

      if (genError && !otp) {
        // The "account not found" case returns a neutral message
        setInfo(genError);
        setLoading(false);
        return;
      }

      if (otp) {
        // Send the OTP via email
        const { error: sendError } = await sendOTPEmail(forgotEmail, otp);
        if (sendError) {
          setError(sendError);
          setLoading(false);
          return;
        }
      }

      setInfo('A one-time login code has been sent to your email. It expires in 10 minutes.');
      setMode('verify-otp');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      const { error: verifyError, session } = await verifyOTPAndSignIn(forgotEmail, otpCode);
      if (verifyError) {
        setError(verifyError);
        setLoading(false);
        return;
      }
      if (session) {
        // Update auth context with the new session, then navigate
        refreshAuth();
        navigate(from, { replace: true });
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">AnikChat</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' && 'Sign in to your account'}
            {mode === 'signup' && 'Create your account'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'verify-otp' && 'Enter your one-time code'}
          </p>
        </div>

        {/* Tab toggle (login/signup only) */}
        {(mode === 'login' || mode === 'signup') && (
          <div className="flex rounded-lg border bg-muted p-1 gap-1">
            <button
              onClick={() => switchMode('login')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                mode === 'login'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => switchMode('signup')}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                mode === 'signup'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Back button (forgot/verify-otp modes) */}
        {(mode === 'forgot' || mode === 'verify-otp') && (
          <button
            onClick={() => switchMode('login')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </button>
        )}

        {/* Success state after signup */}
        {signupDone ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                ✅ Account created! Check your email for a confirmation link, then sign in.
              </AlertDescription>
            </Alert>
            <Button variant="outline" className="w-full" onClick={() => switchMode('login')}>
              Back to Sign In
            </Button>
          </div>
        ) : mode === 'forgot' ? (
          /* ── Forgot Password: enter email ── */
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert>
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email Address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  We'll send a one-time login code to this email.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send Reset Code
              </Button>
            </form>
          </div>
        ) : mode === 'verify-otp' ? (
          /* ── Verify OTP: enter 6-digit code ── */
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {info && (
              <Alert>
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="otp-code">One-Time Code</Label>
                <Input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  disabled={loading}
                  autoFocus
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the 6-digit code sent to <strong>{forgotEmail}</strong>
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading || otpCode.length !== 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verify & Sign In
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              Didn't receive the code?{' '}
              <button
                onClick={() => switchMode('forgot')}
                className="text-primary underline-offset-4 hover:underline"
              >
                Resend
              </button>
            </p>
          </div>
        ) : (
          /* ── Login / Signup form ── */
          <div className="space-y-4">
            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Email / Password form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>

              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={6}
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            {mode === 'login' && (
              <div className="space-y-2">
                <p className="text-center">
                  <button
                    onClick={() => {
                      setForgotEmail(email); // Pre-fill with any email already entered
                      switchMode('forgot');
                    }}
                    className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline transition-colors"
                  >
                    Forgot Password?
                  </button>
                </p>
                <p className="text-center text-xs text-muted-foreground">
                  Don't have an account?{' '}
                  <button
                    onClick={() => switchMode('signup')}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Sign up free
                  </button>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
