import React, { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Menu, Search, Bell, Plus, Home, FolderOpen, LayoutTemplate,
  Users, Layers, ArrowRight, Sun, Moon, Image as ImageIcon,
  Video, Sparkles, Monitor, Maximize, Smartphone, Grid, FileText, X,
  Check, ChevronRight, CircleUserRound
} from 'lucide-react';
import styles from './DashboardPage.module.css';

type DashboardTab = 'home' | 'recent' | 'templates' | 'invite' | 'graphic' | 'teams';
type TemplateCategory = 'All' | 'Social' | 'Print' | 'Screen';

interface TemplatePreset {
  id: string;
  label: string;
  size: string;
  width: number;
  height: number;
  category: Exclude<TemplateCategory, 'All'>;
  accent: string;
  icon: JSX.Element;
}

interface RecentSetup {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: string;
}

const RECENT_SETUPS_STORAGE_KEY = 'pydree.dashboard.recent-setups.v1';
const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = ['All', 'Social', 'Print', 'Screen'];

const TEMPLATE_PRESETS: readonly TemplatePreset[] = [
  { id: 'instagram-post', label: 'Instagram post', size: '1080 × 1080 px', width: 1080, height: 1080, category: 'Social', accent: '#60a5fa', icon: <Smartphone size={24} /> },
  { id: 'instagram-story', label: 'Instagram story', size: '1080 × 1920 px', width: 1080, height: 1920, category: 'Social', accent: '#fb7185', icon: <Smartphone size={24} /> },
  { id: 'phone-wallpaper', label: 'Phone wallpaper', size: '1440 × 3200 px', width: 1440, height: 3200, category: 'Screen', accent: '#a78bfa', icon: <Smartphone size={24} /> },
  { id: 'photo-collage', label: 'Photo collage', size: '2000 × 2000 px', width: 2000, height: 2000, category: 'Print', accent: '#34d399', icon: <Grid size={24} /> },
  { id: 'desktop-wallpaper', label: 'Desktop wallpaper', size: '1920 × 1080 px', width: 1920, height: 1080, category: 'Screen', accent: '#fbbf24', icon: <Monitor size={24} /> },
];

function isValidDimension(value: number): boolean {
  return Number.isInteger(value) && value >= 40 && value <= 10000;
}

function isRecentSetup(value: unknown): value is RecentSetup {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.width === 'number'
    && isValidDimension(candidate.width)
    && typeof candidate.height === 'number'
    && isValidDimension(candidate.height)
    && typeof candidate.createdAt === 'string';
}

function readRecentSetups(): RecentSetup[] {
  try {
    const rawValue = window.localStorage.getItem(RECENT_SETUPS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }
    const parsedValue: unknown = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue.filter(isRecentSetup).slice(0, 6) : [];
  } catch (error: unknown) {
    console.warn('Unable to read recent dashboard setups.', error);
    return [];
  }
}

function writeRecentSetups(setups: readonly RecentSetup[]): void {
  try {
    window.localStorage.setItem(RECENT_SETUPS_STORAGE_KEY, JSON.stringify(setups));
  } catch (error: unknown) {
    console.warn('Unable to save recent dashboard setups.', error);
  }
}

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export default function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DashboardTab>('home');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('All');
  const [recentSetups, setRecentSetups] = useState<RecentSetup[]>(readRecentSetups);
  const [designName, setDesignName] = useState<string>('Untitled design');
  const [width, setWidth] = useState<string>('1080');
  const [height, setHeight] = useState<string>('1080');
  const [dimensionError, setDimensionError] = useState<string>('');

  const visibleTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return TEMPLATE_PRESETS.filter((template) => {
      const matchesCategory = selectedCategory === 'All' || template.category === selectedCategory;
      const matchesQuery = query.length === 0 || `${template.label} ${template.size}`.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [searchQuery, selectedCategory]);

  /* Previous static project fixtures are intentionally kept out of the dashboard UI.
    { id: '1', title: 'Landing Page UI', time: '02.30 • 7.2 MB', icon: <LayoutTemplate size={32} /> },
    { id: '2', title: 'Social Media Assets', time: 'Yesterday • 1.4 MB', icon: <ImageIcon size={32} /> },
    { id: '3', title: 'Q3 Presentation', time: '3 days ago • 12 MB', icon: <Monitor size={32} /> },
    { id: '4', title: 'Brand Guidelines', time: 'Last week • 4.5 MB', icon: <FileText size={32} /> },
  ]; */

  const openNewDesign = (preset?: TemplatePreset): void => {
    if (preset) {
      setDesignName(preset.label);
      setWidth(String(preset.width));
      setHeight(String(preset.height));
    }
    setDimensionError('');
    setIsCreateOpen(true);
  };

  const createDesign = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const parsedWidth = Number(width);
    const parsedHeight = Number(height);
    if (!isValidDimension(parsedWidth) || !isValidDimension(parsedHeight)) {
      setDimensionError('Use whole-number dimensions between 40 and 10,000 pixels.');
      return;
    }
    const title = designName.trim() || 'Untitled design';
    const nextRecentSetup: RecentSetup = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${title}`,
      name: title,
      width: parsedWidth,
      height: parsedHeight,
      createdAt: new Date().toISOString(),
    };
    const nextRecentSetups = [nextRecentSetup, ...recentSetups].slice(0, 6);
    setRecentSetups(nextRecentSetups);
    writeRecentSetups(nextRecentSetups);
    navigate(`/editor?new=1&name=${encodeURIComponent(title)}&width=${parsedWidth}&height=${parsedHeight}`);
  };

  const openRecentSetup = (setup: RecentSetup): void => {
    setDesignName(setup.name);
    setWidth(String(setup.width));
    setHeight(String(setup.height));
    setDimensionError('');
    setIsCreateOpen(true);
  };

  const clearRecentSetups = (): void => {
    setRecentSetups([]);
    writeRecentSetups([]);
  };

  const scrollTo = (id: string, tab: DashboardTab): void => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && visibleTemplates.length > 0) {
      openNewDesign(visibleTemplates[0]);
    }
  };

  return (
    <div className={`${styles.appContainer} ${theme === 'light' ? styles.lightMode : ''}`}>
      
      {/* DESKTOP SIDEBAR */}
      <aside className={styles.desktopSidebar}>
        <div className={styles.sidebarHeader}>
          <img src="/logo.png" alt="PyDree Studio" className={styles.brandLogo} />
          <span className={styles.brandName}>Pdyee Studio</span>
        </div>
        
        <div className={styles.sidebarSection}>Workspace</div>
        <nav className={styles.sidebarNav} aria-label="Workspace navigation">
          <button type="button" className={`${styles.sideItem} ${activeTab === 'home' ? styles.sideActive : ''}`} onClick={() => scrollTo('dashboard-home', 'home')}>
            <Home size={18} /> <span>Home</span>
          </button>
          <button type="button" className={`${styles.sideItem} ${activeTab === 'recent' ? styles.sideActive : ''}`} onClick={() => scrollTo('recent-designs', 'recent')}>
            <FolderOpen size={18} /> <span>Recent designs</span>
          </button>
          <button type="button" className={`${styles.sideItem} ${activeTab === 'templates' ? styles.sideActive : ''}`} onClick={() => scrollTo('template-library', 'templates')}>
            <LayoutTemplate size={18} /> <span>Templates</span>
            <span className={styles.badge}>{TEMPLATE_PRESETS.length}</span>
          </button>
          <a className={styles.sideItem} href="mailto:?subject=Join%20my%20PyDree%20workspace">
            <Users size={18} /> <span>Invite members</span>
          </a>
        </nav>
        
        <div className={styles.sidebarSection} style={{ marginTop: 16 }}>Create</div>
        <nav className={styles.sidebarNav}>
          <button type="button" className={styles.sideItem} onClick={() => openNewDesign()}>
            <Layers size={18} /> <span>Graphic design</span>
          </button>
          <button type="button" className={styles.sideItem} onClick={() => openNewDesign()} style={{ color: '#3b82f6' }}>
            <Plus size={18} /> <span>New design</span>
          </button>
        </nav>

        <div style={{ flex: 1 }} />

        {/* UPGRADE CARD */}
        <div className={styles.proCard}>
          <h4>Upgrade to Pro</h4>
          <p>Unlock all features on Pdyee Studio</p>
          <button type="button" className={styles.upgradeBtn} onClick={() => navigate('/pricing')}>Upgrade</button>
        </div>

        {/* THEME TOGGLE */}
        <div className={styles.themeToggle}>
          <button className={`${styles.themeBtn} ${theme === 'light' ? styles.active : ''}`} onClick={() => setTheme('light')}>
            <Sun size={14} /> Light
          </button>
          <button className={`${styles.themeBtn} ${theme === 'dark' ? styles.active : ''}`} onClick={() => setTheme('dark')}>
            <Moon size={14} /> Dark
          </button>
        </div>
      </aside>

      {/* RIGHT WORKSPACE AREA */}
      <div className={styles.appRight}>
        <header className={styles.appHeader}>
          <button
            type="button"
            className={styles.headerLeftMobile}
            aria-label="Open workspace navigation"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            <Menu size={20} />
          </button>
          <div className={styles.headerCenter}>
            <div className={styles.searchBar}>
              <Search size={18} className={styles.searchIcon} />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search templates"
                aria-label="Search templates"
                className={styles.searchInput}
              />
            </div>
          </div>
          <div className={styles.headerRight}>
            <button type="button" className={styles.iconControl} aria-label="Notifications" onClick={() => setIsNotificationsOpen((open) => !open)}>
              <Bell size={18} />
            </button>
            <button type="button" className={styles.createBtn} onClick={() => openNewDesign()}>
              <Plus size={16} /> Create new design
            </button>
            <button type="button" className={styles.avatar} aria-label="Open account menu" onClick={() => setIsProfileOpen((open) => !open)}>A</button>
          </div>
        </header>

        {isMobileMenuOpen && (
          <nav className={styles.mobileNavigation} aria-label="Mobile workspace navigation">
            <button type="button" onClick={() => scrollTo('dashboard-home', 'home')}><Home size={18} /> Home</button>
            <button type="button" onClick={() => scrollTo('recent-designs', 'recent')}><FolderOpen size={18} /> Recent designs</button>
            <button type="button" onClick={() => scrollTo('template-library', 'templates')}><LayoutTemplate size={18} /> Templates</button>
            <button type="button" onClick={() => openNewDesign()}><Plus size={18} /> New design</button>
          </nav>
        )}

        {isNotificationsOpen && (
          <div className={styles.popover} role="status">
            <strong>You’re all caught up</strong>
            <span>Design activity and export updates will appear here.</span>
          </div>
        )}

        {isProfileOpen && (
          <div className={`${styles.popover} ${styles.profilePopover}`}>
            <CircleUserRound size={20} />
            <div><strong>Workspace account</strong><span>Manage settings from your profile.</span></div>
          </div>
        )}

        <main className={styles.appMain} id="dashboard-home">
          <div className={styles.mainContentWrapper}>

            {/* HERO BANNER */}
            <section className={styles.heroBanner}>
              <h1 className={styles.heroTitle}>Let's create your new design</h1>
              <div className={styles.heroActions}>
                <button type="button" className={styles.heroActionBtn} onClick={() => openNewDesign()}>
                  <div className={styles.heroActionIcon}><Sparkles size={24} /></div>
                  <span className={styles.heroActionLabel}>For you</span>
                </button>
                <button type="button" className={styles.heroActionBtn} onClick={() => openNewDesign()}>
                  <div className={styles.heroActionIcon}><ImageIcon size={24} /></div>
                  <span className={styles.heroActionLabel}>Photo Editor</span>
                </button>
                <button type="button" className={styles.heroActionBtn} onClick={() => openNewDesign()}>
                  <div className={styles.heroActionIcon}><Video size={24} /></div>
                  <span className={styles.heroActionLabel}>Video Editor</span>
                </button>
                <button type="button" className={styles.heroActionBtn} onClick={() => openNewDesign()}>
                  <div className={styles.heroActionIcon}><Sparkles size={24} color="#3b82f6" /></div>
                  <span className={styles.heroActionLabel}>AI Image</span>
                </button>
                <button type="button" className={styles.heroActionBtn} onClick={() => openNewDesign()}>
                  <div className={styles.heroActionIcon}><Maximize size={24} /></div>
                  <span className={styles.heroActionLabel}>Custom Size</span>
                </button>
              </div>
            </section>

            {/* QUICK TEMPLATES */}
            <section id="template-library">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Start from a format</h2>
                <button type="button" className={styles.seeAll} onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }}>Show all <ArrowRight size={14} /></button>
              </div>
              <div className={styles.categoryFilters} role="group" aria-label="Filter design formats">
                {TEMPLATE_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`${styles.categoryFilter} ${selectedCategory === category ? styles.categoryFilterActive : ''}`}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className={styles.quickTemplatesGrid}>
                {visibleTemplates.map((template) => (
                  <button key={template.id} type="button" className={styles.templateCard} onClick={() => openNewDesign(template)}>
                    <div className={styles.templateIcon} style={{ color: template.accent }}>{template.icon}</div>
                    <div>
                      <div className={styles.templateName}>{template.label}</div>
                      <div className={styles.templateSize}>{template.size}</div>
                    </div>
                  </button>
                ))}
                {visibleTemplates.length === 0 && (
                  <div className={styles.emptySearch}>No formats match “{searchQuery}”. Try a different search.</div>
                )}
                {/* Previous static format cards are replaced by the searchable preset catalogue above.
                <div className={styles.templateCard} onClick={() => navigate('/editor?width=1080&height=1080')}>
                  <div className={styles.templateIcon}><Smartphone size={24} color="#3b82f6" /></div>
                  <div>
                    <div className={styles.templateName}>Instagram Posts</div>
                    <div className={styles.templateSize}>1080 × 1080 px</div>
                  </div>
                </div>
                <div className={styles.templateCard} onClick={() => navigate('/editor?width=1080&height=1920')}>
                  <div className={styles.templateIcon}><Smartphone size={24} color="#f43f5e" /></div>
                  <div>
                    <div className={styles.templateName}>Instagram Story</div>
                    <div className={styles.templateSize}>1080 × 1920 px</div>
                  </div>
                </div>
                <div className={styles.templateCard} onClick={() => navigate('/editor?width=1440&height=3200')}>
                  <div className={styles.templateIcon}><Smartphone size={24} color="#8b5cf6" /></div>
                  <div>
                    <div className={styles.templateName}>Phone Wallpaper</div>
                    <div className={styles.templateSize}>1440 × 3200 px</div>
                  </div>
                </div>
                <div className={styles.templateCard} onClick={() => navigate('/editor?width=2000&height=2000')}>
                  <div className={styles.templateIcon}><Grid size={24} color="#10b981" /></div>
                  <div>
                    <div className={styles.templateName}>Photo Collage</div>
                    <div className={styles.templateSize}>2000 × 2000 px</div>
                  </div>
                </div>
                <div className={styles.templateCard} onClick={() => navigate('/editor?width=1920&height=1080')}>
                  <div className={styles.templateIcon}><Monitor size={24} color="#f59e0b" /></div>
                  <div>
                    <div className={styles.templateName}>Desktop Wallpaper</div>
                    <div className={styles.templateSize}>1920 × 1080 px</div>
                  </div>
                </div>
                */}
              </div>
            </section>

            {/* RECENT IMAGE PROJECTS */}
            <section id="recent-designs">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Recent setups</h2>
                {recentSetups.length > 0 ? (
                  <button type="button" className={styles.seeAll} onClick={clearRecentSetups}>Clear history</button>
                ) : (
                  <button type="button" className={styles.seeAll} onClick={() => openNewDesign()}>Create one <ArrowRight size={14} /></button>
                )}
              </div>

              <div className={styles.projectsGrid}>
                {recentSetups.length === 0 ? (
                  <div className={styles.emptyState}>
                    <FileText size={28} />
                    <div><strong>Your design history starts here.</strong><span>New design setups will appear here on this device.</span></div>
                    <button type="button" onClick={() => openNewDesign()}><Plus size={16} /> Create a design</button>
                  </div>
                ) : recentSetups.map((setup) => (
                  <button key={setup.id} type="button" className={styles.recentSetupCard} onClick={() => openRecentSetup(setup)}>
                    <div className={styles.recentSetupIcon}><FileText size={22} /></div>
                    <div className={styles.recentSetupInfo}>
                      <strong>{setup.name}</strong>
                      <span>{setup.width} × {setup.height} px · {formatRelativeDate(setup.createdAt)}</span>
                    </div>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                ))}
                {/* Previous synthetic project cards are replaced with the honest empty workspace state above.
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={styles.projectCard}>
                      <Skeleton style={{ width: "100%", height: "160px", background: "var(--p-bg-3)" }} />
                      <div className={styles.projectInfo}>
                        <Skeleton style={{ width: "70%", height: "16px", borderRadius: "4px", background: "var(--p-bg-3)" }} />
                        <Skeleton style={{ width: "40%", height: "12px", borderRadius: "4px", background: "var(--p-bg-2)", marginTop: "8px" }} />
                      </div>
                    </div>
                  ))
                ) : (
                  projects.map((proj) => (
                    <div key={proj.id} className={styles.projectCard} onClick={() => navigate('/editor?new=1')}>
                      <div className={styles.projectPreview}>
                        <div className={styles.projectPreviewIcon}>{proj.icon}</div>
                      </div>
                      <div className={styles.projectInfo}>
                        <div className={styles.projectTitle}>{proj.title}</div>
                        <div className={styles.projectMeta}>{proj.time}</div>
                      </div>
                    </div>
                  ))
                )}
                */}
              </div>
            </section>

          </div>
        </main>

        {isCreateOpen && (
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setIsCreateOpen(false)}>
            <section className={styles.createModal} role="dialog" aria-modal="true" aria-labelledby="new-design-heading" onMouseDown={(event) => event.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div>
                  <span className={styles.modalEyebrow}>New file</span>
                  <h2 id="new-design-heading">Create a design</h2>
                </div>
                <button type="button" className={styles.iconControl} aria-label="Close new design dialog" onClick={() => setIsCreateOpen(false)}><X size={18} /></button>
              </div>
              <form className={styles.createForm} onSubmit={createDesign}>
                <label>
                  <span>Design name</span>
                  <input value={designName} onChange={(event) => setDesignName(event.target.value)} maxLength={80} autoFocus />
                </label>
                <div className={styles.dimensionFields}>
                  <label><span>Width (px)</span><input inputMode="numeric" value={width} onChange={(event) => setWidth(event.target.value)} /></label>
                  <span className={styles.dimensionSeparator}>×</span>
                  <label><span>Height (px)</span><input inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} /></label>
                </div>
                {dimensionError && <p className={styles.formError}>{dimensionError}</p>}
                <p className={styles.modalHint}><Check size={16} /> You can adjust the canvas after opening the editor.</p>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setIsCreateOpen(false)}>Cancel</button>
                  <button type="submit" className={styles.primaryButton}>Open editor <ChevronRight size={16} /></button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
