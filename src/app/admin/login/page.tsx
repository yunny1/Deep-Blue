'use client';
// src/app/admin/login/page.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push('/admin');
      } else {
        setError('用户名或密码错误');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0D1B2A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 400, padding: '40px 36px',
        backgroundColor: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(42,157,143,0.2)',
        borderRadius: 16,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🌊</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#EDF2F7' }}>DEEP BLUE</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>管理后台</div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
              style={{
                width: '100%', height: 44, borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0 14px', color: '#EDF2F7', fontSize: 14,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', height: 44, borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0 14px', color: '#EDF2F7', fontSize: 14,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 8,
              backgroundColor: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              fontSize: 13, color: '#EF4444',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', height: 44, borderRadius: 8,
              backgroundColor: loading ? 'rgba(42,157,143,0.4)' : '#2A9D8F',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a href="/" style={{ fontSize: 12, color: '#4B5563', textDecoration: 'none' }}>
            ← 返回地图
          </a>
        </div>
      </div>
    </div>
  );
}
