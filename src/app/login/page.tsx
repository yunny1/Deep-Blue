'use client';
// src/app/login/page.tsx
//
// Deep Blue 登录页
//
// 视觉设计：
//   与产品主色系一致——深邃黑色背景 + 青色 (#2A9D8F) 交互元素。
//   背景使用细网格纹理传递"情报系统"的视觉语言。
//   表单卡片使用玻璃拟态风格，与主页面的面板视觉一致。
//
// 腾讯云 CAPTCHA 集成：
//   SDK 通过 <script> 动态加载，加载完成后激活"点击验证"按钮。
//   验证通过后 ticket + randstr 保存在组件状态，随登录表单一起提交到后端。
//   后端验证 ticket 的真实性，确保无法绕过 CAPTCHA 直接调用登录 API。
//
// 注意：NEXT_PUBLIC_TENCENT_CAPTCHA_APP_ID 必须在 Vercel 环境变量中配置，
//       这是前端加载 CAPTCHA 控件所需的 AppId（非 SecretKey）。

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// TypeScript 类型声明：腾讯云 CAPTCHA 全局对象
declare global {
  interface Window {
    TencentCaptcha: new (
      appId: string,
      callback: (res: { ret: number; ticket: string; randstr: string; errorCode?: number }) => void,
      options?: Record<string, unknown>
    ) => { show: () => void; destroy: () => void };
  }
}

// ── 主登录表单组件 ──────────────────────────────────────────────────
function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [username,      setUsername]      = useState('');
  const [password,      setPassword]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [error,         setError]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [captchaReady,  setCaptchaReady]  = useState(false);
  const [captchaDone,   setCaptchaDone]   = useState(false);
  const [captchaTicket, setCaptchaTicket] = useState('');
  const [captchaRandstr,setCaptchaRandstr]= useState('');

  // 动态加载腾讯云 CAPTCHA SDK
  useEffect(() => {
    if (document.querySelector('script[src*="TCaptcha"]')) {
      // 已经加载过
      if (window.TencentCaptcha) setCaptchaReady(true);
      return;
    }
    const script    = document.createElement('script');
    script.src      = 'https://ssl.captcha.qq.com/TCaptcha.js';
    script.async    = true;
    script.onload   = () => setCaptchaReady(true);
    script.onerror  = () => {
      // 加载失败时允许继续（后端会以 CAPTCHA 未配置模式处理）
      console.warn('[CAPTCHA] SDK 加载失败，将跳过人机验证');
      setCaptchaReady(true);
    };
    document.body.appendChild(script);
  }, []);

  // 触发腾讯云 CAPTCHA 弹出验证
  const handleCaptcha = () => {
    if (!captchaReady) return;

    const appId = process.env.NEXT_PUBLIC_TENCENT_CAPTCHA_APP_ID;

    // 若未配置 AppId（开发环境），使用 mock ticket 直接跳过
    if (!appId || !window.TencentCaptcha) {
      console.warn('[CAPTCHA] 未配置 AppId，使用开发模式 mock ticket');
      setCaptchaTicket('dev-mock-ticket');
      setCaptchaRandstr('dev-mock-randstr');
      setCaptchaDone(true);
      return;
    }

    try {
      const captcha = new window.TencentCaptcha(appId, (res) => {
        if (res.ret === 0) {
          // 验证通过
          setCaptchaTicket(res.ticket);
          setCaptchaRandstr(res.randstr);
          setCaptchaDone(true);
        } else {
          setError('人机验证未完成，请重试');
        }
      });
      captcha.show();
    } catch (e) {
      console.error('[CAPTCHA] 初始化失败:', e);
      setError('验证码加载失败，请刷新页面重试');
    }
  };

  // 提交登录
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError('请输入账号'); return; }
    if (!password)        { setError('请输入密码'); return; }
    if (!captchaDone)     { setError('请先完成人机验证'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          ticket:   captchaTicket,
          randstr:  captchaRandstr,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // 登录成功，跳转回原始请求路径或主页
        const from = searchParams.get('from') || '/';
        router.push(from);
        router.refresh();
      } else {
        setError(data.error || '登录失败，请重试');
        // 登录失败时重置 CAPTCHA，要求重新验证
        setCaptchaDone(false);
        setCaptchaTicket('');
        setCaptchaRandstr('');
      }
    } catch {
      setError('网络连接失败，请检查网络后重试');
      setCaptchaDone(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#05080A',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: '24px',
      overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');

        /* 背景细网格 */
        .login-bg::before {
          content: '';
          position: fixed; inset: 0;
          background-image:
            linear-gradient(rgba(42,157,143,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(42,157,143,0.04) 1px, transparent 1px);
          background-size: 64px 64px;
          pointer-events: none;
          z-index: 0;
        }
        /* 暗角渐变 */
        .login-bg::after {
          content: '';
          position: fixed; inset: 0;
          background: radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #05080A 100%);
          pointer-events: none;
          z-index: 0;
        }

        /* 输入框 */
        .login-input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: #F0E6C8;
          font-size: 14px;
          font-family: 'DM Sans', system-ui, sans-serif;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .login-input:focus {
          border-color: rgba(42,157,143,0.5);
        }
        .login-input::placeholder {
          color: rgba(240,230,200,0.25);
        }

        /* 主按钮 */
        .login-btn-primary {
          width: 100%;
          padding: 13px;
          background: transparent;
          border: 1px solid rgba(42,157,143,0.6);
          border-radius: 8px;
          color: #2A9D8F;
          font-size: 13px;
          font-weight: 600;
          font-family: 'DM Sans', system-ui, sans-serif;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, color 0.2s;
        }
        .login-btn-primary:hover:not(:disabled) {
          background: rgba(42,157,143,0.12);
          border-color: #2A9D8F;
          color: #5FD4C4;
        }
        .login-btn-primary:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        /* CAPTCHA 按钮 */
        .captcha-btn {
          width: 100%;
          padding: 11px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: rgba(240,230,200,0.55);
          font-size: 13px;
          font-family: 'DM Sans', system-ui, sans-serif;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .captcha-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.18);
          color: rgba(240,230,200,0.8);
        }
        .captcha-btn.done {
          border-color: rgba(34,197,94,0.4);
          color: #22C55E;
          background: rgba(34,197,94,0.06);
          cursor: default;
        }
        .captcha-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(42,157,143,0.3);
          border-top-color: #2A9D8F;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-card {
          animation: fade-up 0.5s ease both;
        }
      `}</style>

      <div className="login-bg" />

      {/* 登录卡片 */}
      <div className="login-card" style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 400,
        background: 'rgba(8,16,30,0.9)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(42,157,143,0.15)',
        borderRadius: 16,
        padding: '36px 32px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
      }}>

        {/* 品牌标识 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* 五色签名条 */}
          <div style={{ display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden', marginBottom: 24 }}>
            {['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'].map(c => (
              <div key={c} style={{ flex: 1, background: c }} />
            ))}
          </div>

          <div style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28, fontWeight: 800,
            color: '#F0E6C8',
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}>
            DEEP BLUE
          </div>

          <div style={{
            fontFamily: 'monospace',
            fontSize: 9,
            color: 'rgba(42,157,143,0.6)',
            letterSpacing: '2px',
            textTransform: 'uppercase' as const,
          }}>
            SUBMARINE CABLE INTELLIGENCE SYSTEM
          </div>
        </div>

        {/* 分隔线 */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 28 }} />

        {/* 表单 */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 账号 */}
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'rgba(240,230,200,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 6 }}>
              账号 Account
            </label>
            <input
              className="login-input"
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              placeholder="请输入账号"
              autoComplete="username"
              autoFocus
            />
          </div>

          {/* 密码 */}
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'rgba(240,230,200,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 6 }}>
              密码 Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="login-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="请输入密码"
                autoComplete="current-password"
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  color: 'rgba(240,230,200,0.3)', cursor: 'pointer',
                  fontSize: 16, lineHeight: 1, padding: 2,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'rgba(240,230,200,0.7)'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'rgba(240,230,200,0.3)'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* 腾讯云 CAPTCHA */}
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'rgba(240,230,200,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 6 }}>
              人机验证 Verification
            </label>
            <button
              type="button"
              className={`captcha-btn${captchaDone ? ' done' : ''}`}
              onClick={captchaDone ? undefined : handleCaptcha}
              disabled={!captchaReady || loading}
            >
              {captchaDone ? (
                <>
                  <span style={{ fontSize: 15 }}>✓</span>
                  验证已通过
                </>
              ) : !captchaReady ? (
                <>
                  <div className="spinner" />
                  验证码加载中…
                </>
              ) : (
                <>
                  <span style={{ fontSize: 15 }}>🛡</span>
                  点击进行人机验证
                </>
              )}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8,
              fontSize: 13,
              color: '#F87171',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>⚠</span>
              {error}
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type="submit"
            className="login-btn-primary"
            disabled={loading || !captchaDone || !username || !password}
            style={{ marginTop: 4 }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div className="spinner" style={{ borderTopColor: '#2A9D8F' }} />
                验证中…
              </span>
            ) : (
              '进入系统 →'
            )}
          </button>
        </form>

        {/* 底部说明 */}
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.05em' }}>
          访问权限受限 · 请使用授权账号登录
        </div>
      </div>

      {/* 页面底部版权 */}
      <div style={{
        position: 'relative', zIndex: 1, marginTop: 24,
        fontFamily: 'monospace', fontSize: 9,
        color: 'rgba(255,255,255,0.08)',
        letterSpacing: '1.5px', textTransform: 'uppercase' as const,
      }}>
        DEEP-BLUE · OPEN SOURCE INTELLIGENCE · deep-cloud.org
      </div>
    </div>
  );
}

// ── 页面根组件（需要 Suspense 包裹，因为用了 useSearchParams）──────
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ position: 'fixed', inset: 0, background: '#05080A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(42,157,143,0.6)', fontFamily: 'monospace', fontSize: 12, letterSpacing: 2 }}>
          LOADING…
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
