/**
 * ProfileSettings — Account profile, password, & email service configuration
 */

import { useState, useCallback, useEffect } from 'react';
import { Eye, EyeOff, Lock, Mail, Calendar, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { changePassword } from '@/lib/customAuth';
import { getEmailJSConfig, saveEmailJSConfig, type EmailJSConfig } from '@/lib/emailService';
import { toast } from 'sonner';

export function ProfileSettings() {
  const { user } = useAuth();

  // Password change form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  // EmailJS config state
  const [emailjsServiceId, setEmailjsServiceId] = useState('');
  const [emailjsTemplateId, setEmailjsTemplateId] = useState('');
  const [emailjsPublicKey, setEmailjsPublicKey] = useState('');
  const [emailjsSaved, setEmailjsSaved] = useState(false);

  // Load saved EmailJS config on mount
  useEffect(() => {
    const config = getEmailJSConfig();
    if (config) {
      setEmailjsServiceId(config.serviceId);
      setEmailjsTemplateId(config.templateId);
      setEmailjsPublicKey(config.publicKey);
    }
  }, []);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !isChanging;

  const handleSaveEmailJS = useCallback(() => {
    if (!emailjsServiceId || !emailjsTemplateId || !emailjsPublicKey) {
      toast.error('All three EmailJS fields are required');
      return;
    }
    saveEmailJSConfig({
      serviceId: emailjsServiceId,
      templateId: emailjsTemplateId,
      publicKey: emailjsPublicKey,
    });
    setEmailjsSaved(true);
    toast.success('Email service configured');
    setTimeout(() => setEmailjsSaved(false), 2000);
  }, [emailjsServiceId, emailjsTemplateId, emailjsPublicKey]);

  const handleChangePassword = useCallback(async () => {
    if (!user) return;

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsChanging(true);
    try {
      const { error } = await changePassword(user.id, currentPassword, newPassword);
      if (error) {
        toast.error(error);
      } else {
        toast.success('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } finally {
      setIsChanging(false);
    }
  }, [user, currentPassword, newPassword, confirmPassword]);

  const createdDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  return (
    <div className="space-y-6">

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white font-bold text-lg shrink-0">
              {user?.email?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{user?.email ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>Joined {createdDate}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your password. Must be at least 8 characters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current password */}
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                tabIndex={-1}
              >
                {showCurrentPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {/* New password */}
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowNewPassword(!showNewPassword)}
                tabIndex={-1}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-destructive">
                Must be at least 8 characters
              </p>
            )}
          </div>

          {/* Confirm new password */}
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">
                Passwords do not match
              </p>
            )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={!canSubmit}
            className="w-full"
          >
            {isChanging ? 'Changing…' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      {/* Email Service (EmailJS) — for Forgot Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Email Service (Forgot Password)
          </CardTitle>
          <CardDescription>
            Configure EmailJS to enable one-time password reset codes sent via email.
            Free at{' '}
            <a
              href="https://www.emailjs.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4"
            >
              emailjs.com
            </a>{' '}
            (200 emails/month).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emailjs-service">Service ID</Label>
            <Input
              id="emailjs-service"
              value={emailjsServiceId}
              onChange={(e) => setEmailjsServiceId(e.target.value.trim())}
              placeholder="e.g. service_abc123"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emailjs-template">Template ID</Label>
            <Input
              id="emailjs-template"
              value={emailjsTemplateId}
              onChange={(e) => setEmailjsTemplateId(e.target.value.trim())}
              placeholder="e.g. template_xyz789"
            />
            <p className="text-xs text-muted-foreground">
              Template must use variables: <code className="bg-muted px-1 rounded">{'{{to_email}}'}</code>, <code className="bg-muted px-1 rounded">{'{{otp_code}}'}</code>, <code className="bg-muted px-1 rounded">{'{{app_name}}'}</code>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="emailjs-key">Public Key</Label>
            <Input
              id="emailjs-key"
              value={emailjsPublicKey}
              onChange={(e) => setEmailjsPublicKey(e.target.value.trim())}
              placeholder="e.g. user_abc123def456"
            />
          </div>
          <Button
            onClick={handleSaveEmailJS}
            disabled={!emailjsServiceId || !emailjsTemplateId || !emailjsPublicKey}
            className="w-full"
            variant="outline"
          >
            {emailjsSaved ? 'Saved!' : 'Save Email Config'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
