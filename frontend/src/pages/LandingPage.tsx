import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './LandingPage.module.css';
import { ArrowRight, Compass, Clock, Sparkles } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.outerCanvas}>
      <div className={styles.mainFrame}>
        
        {/* Section 1 - Dark story card */}
        <section className={styles.sectionDarkStory}>
          <div className={styles.topBar}>
            <div className={styles.topLeft}>
              <img src="/logo.svg" alt="PyDree Logo" className={styles.logoImg} />
            </div>
            <div className={styles.topRight}>
              <Button variant="ghost" onClick={() => navigate('/login')} label="Log in" />
              <Button variant="primary" onClick={() => navigate('/signup')} label="Sign up" />
            </div>
          </div>
          
          <div className={styles.storyContent}>
            <span className={styles.categoryLabel}>PyDree Studio</span>
            <h1 className={styles.headlineMedium}>
              Convert your imagination into <em className={styles.highlightItalic}>Layers</em>
            </h1>
            <p className={styles.paragraphMuted}>
              Edit, generate, and reimagine photos with just a text prompt. 
              No complex masking required.
            </p>
            
            <div className={styles.aiPromptContainer}>
              <div className={styles.aiPromptWrapper}>
                <Sparkles className={styles.sparkleIcon} />
                <input 
                  type="text" 
                  className={styles.aiPromptInput} 
                  placeholder="Describe your edit..." 
                />
              </div>
              <Button variant="primary" onClick={() => navigate('/editor')} label="Generate" />
            </div>
          </div>

          <div className={styles.bottomGlow}></div>
        </section>

        {/* Section 2 - Light introduction card */}
        <section className={styles.sectionLightIntro}>
          <div className={styles.topBarLight}>
            <span className={styles.numberPurple}>01</span>
            <span className={styles.labelGreenMuted}> — Introduction</span>
          </div>

          <div className={styles.introContent}>
            <div className={styles.introLeft}>
              <h2 className={styles.headlineLargeDark}>
                We use regulatory data solutions to de-risk financials.
              </h2>
              <Button variant="secondary" label="Get a quote" />
            </div>

            <div className={styles.introRight}>
              <div className={styles.iconListItem}>
                <div className={styles.iconCircle}><ArrowRight className={styles.iconPurple} /></div>
                <div className={styles.iconListText}>
                  <h4>Most innovative</h4>
                  <p>Group-think holds you back from getting real results.</p>
                </div>
              </div>
              <div className={styles.iconListItem}>
                <div className={styles.iconCircle}><Compass className={styles.iconPurple} /></div>
                <div className={styles.iconListText}>
                  <h4>You're in control</h4>
                  <p>Not enough time? Save hours and money.</p>
                </div>
              </div>
              <div className={styles.iconListItem}>
                <div className={styles.iconCircle}><Clock className={styles.iconPurple} /></div>
                <div className={styles.iconListText}>
                  <h4>They will wait</h4>
                  <p>They're waiting for your compliance.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3 - Dark team section */}
        <section className={styles.sectionDarkTeam}>
          <div className={styles.topBar}>
            <div className={styles.topLeft}>
              <span className={styles.numberWhite}>03</span>
              <span className={styles.labelMuted}> — The team</span>
            </div>
          </div>

          <div className={styles.teamHeader}>
            <p className={styles.helperText}>
              Optimize your network like never before. Say goodbye to lags.
            </p>
            <h2 className={styles.headlineMassive}>
              Our stories help you understand our vision.
            </h2>
          </div>

          <div className={styles.cardGrid}>
            <div className={styles.placeholderCard}></div>
            <div className={styles.placeholderCard}></div>
            <div className={styles.placeholderCard}></div>
          </div>
        </section>

      </div>
    </div>
  );
}
