import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleX } from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import apiClient from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { AvatarPicker } from '@/components/shared/AvatarPicker';
import { ColorPicker } from '@/components/shared/ColorPicker';
import { MEMBER_PALETTE } from '@/lib/memberPalette';
import { SignupConsent } from '@/components/shared/SignupConsent';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';

interface ValidateResponse {
  valid: boolean;
  cabinName: string;
  welcomeMessage: string | null;
  role: string;
  invitedBy: string;
  invitedByIcon: string | null;
  message?: string;
}

interface AcceptResponse {
  token: string;
  username: string;
  userId: string;
  role: string;
  color: string;
  animalIcon: string;
  cabinId: string;
  cabinName: string;
  isSuperAdmin?: boolean;
}

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Chyba odeslání registrace zůstává u formuláře, neplatnou pozvánku nesignalizuje (#514).
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<ValidateResponse | null>(null);
  const [step, setStep] = useState<'welcome' | 'register'>('welcome');

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    animalIcon: 'liska',
    color: MEMBER_PALETTE[0].hex
  });
  
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function validateToken() {
      try {
        const res = await apiClient.get<ValidateResponse>(`/invites/validate/${token}`);
        if (!res.data.valid) {
          setError(res.data.message || 'Pozvánka není platná.');
        } else {
          setInviteInfo(res.data);
        }
      } catch (err: unknown) {
        const axiosMsg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
        setError(axiosMsg || 'Neplatný nebo expirovaný odkaz.');
      } finally {
        setLoading(false);
      }
    }
    
    if (token) validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInfo) return;
    
    setSubmitting(true);
    setRegisterError(null);
    try {
      const res = await apiClient.post<AcceptResponse>(`/invites/accept/${token}`, {
        username: formData.username,
        password: formData.password,
        email: formData.email || undefined,
        animalIcon: formData.animalIcon,
        color: formData.color
      });
      
      // Accept returns JWT directly — no separate login needed
      const { token: authToken, username, userId, role, animalIcon, cabinId, isSuperAdmin } = res.data;
      login({ token: authToken, username, userId, role, animalIcon, cabinId, isSuperAdmin, remember: true });
      navigate('/dashboard');
    } catch (err: unknown) {
      const axiosMsg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setRegisterError(axiosMsg || 'Registraci se nepodařilo dokončit. Zkus to znovu.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthLayout data-testid="invite-page" data-invite-step="loading">
        <p role="status" className="text-center text-body text-(--text-muted)">Ověřuji pozvánku…</p>
      </AuthLayout>
    );
  }

  if (error || !inviteInfo) {
    return (
      <AuthLayout title="Neplatná pozvánka" data-testid="invite-page" data-invite-step="invalid">
        <div className="flex flex-col items-center gap-3 text-center" data-testid="invite-invalid-card">
          <CircleX size={24} aria-hidden="true" className="text-(--status-error)" />
          <p className="text-body text-(--text-main)">{error}</p>
          <p className="text-body text-(--text-muted)">Požádej toho, kdo tě zval, o nový odkaz.</p>
          <Button asChild size="lg" className="mt-3 w-full">
            <Link to="/login" data-testid="invite-invalid-login-button">Přejít na přihlášení</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const roleLabel = inviteInfo.role === 'admin' ? 'Admin' : inviteInfo.role === 'guest' ? 'Host' : 'Člen';

  // ── Step 1: Welcome ──────────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <AuthLayout title="Pozvánka na chatu" data-testid="invite-page" data-invite-step="welcome">
        <div className="flex flex-col items-center gap-2 text-center" data-testid="invite-welcome-card">
          <p className="text-body text-(--text-main)">
            <strong>{inviteInfo.invitedBy}</strong> tě zve na chatu
          </p>
          <p className="text-card-title text-(--text-main)">„{inviteInfo.cabinName}“</p>
          <span className="rounded-full bg-(--bg-hover) px-3 py-1 text-eyebrow uppercase text-(--text-muted)">{roleLabel}</span>
          {inviteInfo.welcomeMessage && (
            <p className="mt-2 text-body italic text-(--text-muted)">„{inviteInfo.welcomeMessage}“</p>
          )}
          <Button size="lg" className="mt-6 w-full" onClick={() => setStep('register')} data-testid="invite-continue-button">
            Pokračovat
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        <p className="toggle-form-text">
          Už máš účet? <Link to="/login" data-testid="invite-existing-login-link">Přihlásit se</Link>
        </p>
      </AuthLayout>
    );
  }

  // ── Step 2: Registration form ────────────────────────────────────────
  return (
    <AuthLayout title="Vytvoř si účet" subtitle={`„${inviteInfo.cabinName}“`} className="relative" data-testid="invite-page" data-invite-step="register">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4"
        onClick={() => setStep('welcome')}
        aria-label="Zpět"
        data-testid="invite-back-button"
      >
        <ArrowLeft aria-hidden="true" />
      </Button>

      <form onSubmit={handleSubmit} data-testid="invite-register-form">
        <div className="form-group">
          <label htmlFor="invite-username">Uživatelské jméno (tím se budeš přihlašovat)</label>
          <input
            type="text"
            id="invite-username"
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={50}
            placeholder="Např. Tomáš"
            value={formData.username}
            onChange={e => setFormData({ ...formData, username: e.target.value })}
            autoFocus
            data-testid="invite-username-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="invite-password">Heslo</label>
          <input
            type="password"
            id="invite-password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={100}
            placeholder="Min. 8 znaků"
            value={formData.password}
            onChange={e => setFormData({ ...formData, password: e.target.value })}
            data-testid="invite-password-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="invite-email">E-mail (nepovinné)</label>
          <input
            type="email"
            id="invite-email"
            name="email"
            autoComplete="email"
            placeholder="tvuj@email.cz"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            data-testid="invite-email-input"
          />
        </div>

        <div className="form-group">
          <label>Avatar</label>
          <AvatarPicker
            value={formData.animalIcon}
            onChange={val => setFormData({ ...formData, animalIcon: val })}
            compact
          />
        </div>

        <div className="form-group">
          <label>Barva</label>
          <ColorPicker
            value={formData.color}
            onChange={val => setFormData({ ...formData, color: val })}
          />
        </div>

        <SignupConsent />

        {registerError && <p className="error-message show" role="alert" data-testid="invite-register-error">{registerError}</p>}

        <Button type="submit" size="lg" className="mt-4 w-full" pending={submitting} data-testid="invite-submit-button">
          {submitting ? 'Připojuji…' : 'Připojit se k chatě'}
        </Button>
      </form>
    </AuthLayout>
  );
}
