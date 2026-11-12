import { useId, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import type { AuthUser } from '../../shared/types.ts';
import { ApiError, login } from '../api/client.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

interface LoginFormProps {
  onSuccess: (user: AuthUser) => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const usernameId = useId();
  const passwordId = useId();
  const errorId = useId();
  const toggleWarnId = useId();

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touchedUser, setTouchedUser] = useState(false);
  const [touchedPass, setTouchedPass] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validateFields = (u: string, p: string) => {
    const errors: { username?: string; password?: string } = {};
    if (!u.trim()) errors.username = 'Vui lòng nhập tên đăng nhập.';
    if (!p) errors.password = 'Vui lòng nhập mật khẩu.';
    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const errors = validateFields(username, password);
    setFieldErrors(errors);

    if (errors.username) {
      usernameRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const { user } = await login(username.trim(), password);
      onSuccess(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('Không thể kết nối máy chủ. Vui lòng thử lại.');
      }
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-heading">
        <div className="auth-header">
          <div>
            <h1 id="login-heading" className="auth-title">
              Hub Cá Nhân
            </h1>
            <p className="auth-subtitle">Đăng nhập để tải lên và tải xuống file của bạn.</p>
          </div>
          <ThemeToggle />
        </div>

        <div role="status" aria-live="polite">
          {serverError && (
            <div id={errorId} className="alert-error">
              {serverError}
            </div>
          )}
        </div>

        <form method="post" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor={usernameId}>
              Tên đăng nhập <span aria-hidden="true">*</span>
            </label>
            <input
              ref={usernameRef}
              id={usernameId}
              name="username"
              type="text"
              className="input-control"
              autoComplete="username"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              enterKeyHint="next"
              required
              value={username}
              aria-invalid={fieldErrors.username ? 'true' : undefined}
              aria-describedby={fieldErrors.username ? `${usernameId}-err` : undefined}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) {
                  setFieldErrors((prev) => ({ ...prev, username: undefined }));
                }
              }}
              onBlur={() => {
                if (touchedUser || username.length > 0) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    username: username.trim() ? undefined : 'Vui lòng nhập tên đăng nhập.',
                  }));
                }
                setTouchedUser(true);
              }}
            />
            {fieldErrors.username && (
              <small id={`${usernameId}-err`} style={{ color: 'var(--danger)' }}>
                {fieldErrors.username}
              </small>
            )}
          </div>

          <div className="field">
            <label htmlFor={passwordId}>
              Mật khẩu <span aria-hidden="true">*</span>
            </label>
            <div className="password-wrap">
              <input
                ref={passwordRef}
                id={passwordId}
                name="password"
                type={showPassword ? 'text' : 'password'}
                className="input-control"
                autoComplete="current-password"
                enterKeyHint="done"
                required
                value={password}
                aria-invalid={fieldErrors.password ? 'true' : undefined}
                aria-describedby={fieldErrors.password ? `${passwordId}-err` : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                onBlur={() => {
                  if (touchedPass || password.length > 0) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      password: password ? undefined : 'Vui lòng nhập mật khẩu.',
                    }));
                  }
                  setTouchedPass(true);
                }}
              />
              <button
                type="button"
                className="password-toggle"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-describedby={toggleWarnId}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            <span id={toggleWarnId} className="visually-hidden">
              Cảnh báo: thao tác này sẽ hiển thị mật khẩu trên màn hình.
            </span>
            {fieldErrors.password && (
              <small id={`${passwordId}-err`} style={{ color: 'var(--danger)' }}>
                {fieldErrors.password}
              </small>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', minHeight: '48px' }}
            disabled={submitting}
          >
            <Lock size={17} aria-hidden="true" />
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </section>
    </main>
  );
}

