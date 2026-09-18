import React, { useState } from 'react';
import { User, Settings, Shield, Bell, Key, LogOut } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import styles from './DashboardPage.module.css';

export function ProfileSettings(): JSX.Element {
  const [activeSection, setActiveSection] = useState('general');

  return (
    <div style={{ display: 'flex', gap: '32px', height: '100%' }}>
      
      {/* Profile Sidebar */}
      <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <button 
          className={`${styles.sideItem} ${activeSection === 'general' ? styles.sideActive : ''}`} 
          onClick={() => setActiveSection('general')}
          style={{ background: activeSection === 'general' ? 'var(--p-bg-2)' : 'transparent', border: 'none', textAlign: 'left' }}
        >
          <User size={16} /> <span>General</span>
        </button>
        <button 
          className={`${styles.sideItem} ${activeSection === 'security' ? styles.sideActive : ''}`} 
          onClick={() => setActiveSection('security')}
          style={{ background: activeSection === 'security' ? 'var(--p-bg-2)' : 'transparent', border: 'none', textAlign: 'left' }}
        >
          <Shield size={16} /> <span>Security</span>
        </button>
        <button 
          className={`${styles.sideItem} ${activeSection === 'notifications' ? styles.sideActive : ''}`} 
          onClick={() => setActiveSection('notifications')}
          style={{ background: activeSection === 'notifications' ? 'var(--p-bg-2)' : 'transparent', border: 'none', textAlign: 'left' }}
        >
          <Bell size={16} /> <span>Notifications</span>
        </button>
        <button 
          className={`${styles.sideItem} ${activeSection === 'billing' ? styles.sideActive : ''}`} 
          onClick={() => setActiveSection('billing')}
          style={{ background: activeSection === 'billing' ? 'var(--p-bg-2)' : 'transparent', border: 'none', textAlign: 'left' }}
        >
          <Settings size={16} /> <span>Billing & Plans</span>
        </button>
      </div>

      {/* Profile Content */}
      <div style={{ flex: 1, background: 'var(--p-bg-1)', borderRadius: '8px', border: '1px solid var(--p-border)', padding: '32px' }}>
        
        {activeSection === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h2 style={{ fontSize: '20px', margin: 0, fontWeight: 600 }}>Public Profile</h2>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--p-violet)', display: 'grid', placeItems: 'center', fontSize: '32px', fontWeight: 'bold' }}>
                A
              </div>
              <div>
                <Button label="Change Avatar" variant="secondary" />
                <p style={{ color: 'var(--p-fg-2)', fontSize: '12px', marginTop: '8px' }}>JPG, GIF or PNG. 1MB max.</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', color: 'var(--p-fg-1)' }}>Full Name</label>
                <input type="text" defaultValue="Admin User" className={styles.searchInput} style={{ border: '1px solid var(--p-border)', padding: '8px 12px', borderRadius: '6px' }} />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', color: 'var(--p-fg-1)' }}>Email Address</label>
                <input type="email" defaultValue="admin@example.com" className={styles.searchInput} style={{ border: '1px solid var(--p-border)', padding: '8px 12px', borderRadius: '6px' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', color: 'var(--p-fg-1)' }}>Bio</label>
                <textarea rows={4} className={styles.searchInput} style={{ border: '1px solid var(--p-border)', padding: '8px 12px', borderRadius: '6px', resize: 'none' }} placeholder="Tell us about yourself..." />
              </div>

              <Button label="Save Changes" style={{ alignSelf: 'flex-start', marginTop: '8px' }} />
            </div>
          </div>
        )}

        {activeSection === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h2 style={{ fontSize: '20px', margin: 0, fontWeight: 600 }}>Security Settings</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', color: 'var(--p-fg-1)' }}>Current Password</label>
                <input type="password" placeholder="••••••••" className={styles.searchInput} style={{ border: '1px solid var(--p-border)', padding: '8px 12px', borderRadius: '6px' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', color: 'var(--p-fg-1)' }}>New Password</label>
                <input type="password" placeholder="••••••••" className={styles.searchInput} style={{ border: '1px solid var(--p-border)', padding: '8px 12px', borderRadius: '6px' }} />
              </div>
              <Button label="Update Password" style={{ alignSelf: 'flex-start', marginTop: '8px' }} />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--p-border)', margin: '24px 0' }} />

            <div>
               <h3 style={{ fontSize: '16px', margin: '0 0 8px 0' }}>Sessions</h3>
               <p style={{ color: 'var(--p-fg-2)', fontSize: '13px', marginBottom: '16px' }}>This is a list of devices that have logged into your account.</p>
               <Button label="Log out all other devices" variant="secondary" icon={<LogOut size={16} />} />
            </div>
          </div>
        )}

        {/* Other sections can be mocked similarly */}
        {(activeSection === 'notifications' || activeSection === 'billing') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--p-fg-2)' }}>
             <Settings size={48} opacity={0.2} />
             <p>This section is currently under construction.</p>
          </div>
        )}
        
      </div>
    </div>
  );
}
