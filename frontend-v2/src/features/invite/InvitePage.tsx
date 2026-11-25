import { useEffect, useState } from 'react';
import { ArrowLeft, CircleX } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { AvatarPicker } from '@/components/shared/AvatarPicker';
import { ColorPicker } from '@/components/shared/ColorPicker';
import { MEMBER_PALETTE } from '@/lib/memberPalette';
import { SignupConsent } from '@/components/shared/SignupConsent';
import cabinBg from '@/img/olivier-guillard-FKJgBUDoVC0-unsplash.jpg';

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

  const bgStyle: React.CSSProperties = {
    backgroundImage: `url(${cabinBg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

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
      <div className="invite-page" style={bgStyle} data-testid="invite-page" data-invite-step="loading">
        <div style={{ textAlign: 'center' }}>
          <div className="invite-spinner" />
          <p style={{ color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>Ověřuji pozvánku…</p>
        </div>
      </div>
    );
  }

  if (error || !inviteInfo) {
    return (
      <div className="invite-page" style={bgStyle} data-testid="invite-page" data-invite-step="invalid">
        <div className="invite-card invite-card-narrow" data-testid="invite-invalid-card">
          <div className="invite-icon" aria-hidden="true" style={{ color: 'var(--status-error)' }}><CircleX size={48} style={{ display: 'block', margin: '0 auto' }} /></div>
          <h1 className="invite-title">Neplatná pozvánka</h1>
          <p className="invite-text">{error}</p>
          <p className="invite-text">Požádej toho, kdo tě zval, o nový odkaz.</p>
          <button className="invite-btn invite-btn-primary invite-btn-full" onClick={() => navigate('/login')} data-testid="invite-invalid-login-button">
            Přejít na přihlášení
          </button>
        </div>
      </div>
    );
  }

  const roleLabel = inviteInfo.role === 'admin' ? 'Admin' : inviteInfo.role === 'guest' ? 'Host' : 'Člen';

  // ── Step 1: Welcome ──────────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <div className="invite-page" style={bgStyle} data-testid="invite-page" data-invite-step="welcome">
        <div className="invite-card invite-card-narrow" data-testid="invite-welcome-card">
          <h1 className="invite-heading" style={{ fontSize: '1.5rem' }}>
            Pozvánka na chatu
          </h1>
          <p className="invite-text" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
            <strong>{inviteInfo.invitedBy}</strong> tě zve na chatu
          </p>
          <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text, #1a2721)', margin: '0 0 16px' }}>
            „{inviteInfo.cabinName}"
          </p>
          <span className="invite-role-badge" style={{ marginBottom: '16px', display: 'inline-block' }}>{roleLabel}</span>
          {inviteInfo.welcomeMessage && (
            <p className="invite-text invite-text-muted" style={{ marginTop: '8px', fontStyle: 'italic' }}>
              „{inviteInfo.welcomeMessage}"
            </p>
          )}
          <div style={{ marginTop: '24px' }}>
            <button
              className="invite-btn invite-btn-primary invite-btn-full"
              onClick={() => setStep('register')}
              data-testid="invite-continue-button"
            >
              Pokračovat →
            </button>
          </div>
          <div className="invite-back-link">
            Už máš účet? <a onClick={() => navigate('/login')} data-testid="invite-existing-login-link">Přihlásit se</a>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Registration form ────────────────────────────────────────
  return (
    <div className="invite-page" style={bgStyle} data-testid="invite-page" data-invite-step="register">
      <div className="invite-card invite-card-compact" data-testid="invite-register-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <button
            type="button"
            className="invite-back-btn"
            onClick={() => setStep('welcome')}
            title="Zpět"
            aria-label="Zpět"
            data-testid="invite-back-button"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h2 className="invite-heading" style={{ margin: 0, fontSize: '1.15rem' }}>
            Vytvoř si účet — {inviteInfo.cabinName}
          </h2>
        </div>

        {registerError && <div className="invite-error-msg" role="alert" data-testid="invite-register-error">{registerError}</div>}

        <form onSubmit={handleSubmit} data-testid="invite-register-form">
          <div className="invite-form-group">
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

          <div className="invite-form-row">
            <div className="invite-form-group">
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
            <div className="invite-form-group">
              <label htmlFor="invite-email">E-mail <span className="invite-optional">(nepovinné)</span></label>
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
          </div>

          <div className="invite-form-row">
            <div className="invite-form-group" style={{ flex: '1 1 60%' }}>
              <label>Avatar</label>
              <AvatarPicker 
                value={formData.animalIcon}
                onChange={val => setFormData({ ...formData, animalIcon: val })}
                compact
              />
            </div>
            <div className="invite-form-group" style={{ flex: '1 1 35%' }}>
              <label>Barva</label>
              <ColorPicker 
                value={formData.color}
                onChange={val => setFormData({ ...formData, color: val })}
                size={26}
              />
            </div>
          </div>

          <SignupConsent />

          <button 
            type="submit" 
            className="invite-btn invite-btn-primary invite-btn-full"
            disabled={submitting}
            data-testid="invite-submit-button"
          >
            {submitting ? 'Připojuji…' : 'Připojit se k chatě →'}
          </button>
        </form>
      </div>
    </div>
  );
}
