import { type CSSProperties } from 'react';
import { VStack, HStack, StackItem } from '@astryxdesign/core/Layout';
import { Grid } from '@astryxdesign/core/Grid';
import { Center } from '@astryxdesign/core/Center';
import { Card } from '@astryxdesign/core/Card';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { SignIn } from '@clerk/react';

const COVER_IMAGE_URL = '/galaxy-login-bg.jpg';

const COLUMN_MIN_WIDTH = 240;

// This page needs more updates. right now it is just a copy of the Clerk login page with some custom styling. 
// The background image, colors, and fonts have been changed to match the Pdyye brand, but the layout and functionality are still the same as the default Clerk login page. 
// The next steps would be to add more custom content, such as a welcome message, links to the privacy policy and terms of service, and any other relevant information for users logging in or signing up.
const TOKENS = {
  paper: '#f6f2e9',
  ink: '#17140f',
  inkSoft: '#3d382e',
  void: '#0d0c0b',
  voidSoft: '#151411',
  panel: '#171512',
  line: 'rgba(246, 242, 233, 0.12)',
  plateBlue: '#3d6fe0',
};

const pageStyle: CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  backgroundColor: TOKENS.void,
  padding: 'var(--spacing-6, 1.5rem)',
  overflow: 'hidden',
};

const cardWrap: CSSProperties = {
  width: '100%',
  maxWidth: 1000,
  marginInline: 'auto',
  position: 'relative',
  zIndex: 1,
};

// Passed as a style prop directly to Card, rather than wrapping its
// children in a new div. An earlier version inserted an extra div here
// and it broke Card's internal sizing assumptions badly. This way, if
// Card forwards unknown props to its root node (common for this kind of
// thin wrapper component), the surface picks up brand colors; if it
// doesn't, Card just renders its own default look, no worse off than
// before and nothing about the layout breaks either way.
const cardSurfaceStyle: CSSProperties = {
  background: TOKENS.panel,
  border: `1px solid ${TOKENS.line}`,
  borderRadius: 20,
};

const coverImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const LOGIN_SPLIT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');

.pdyye-login-page {
  font-family: 'Manrope', sans-serif;
}

/* Ink bleed. Same device used on About/Pricing/Dashboard: soft,
   low-opacity plate colors behind the hero, not a flat gradient. */
.pdyye-ink-bleed {
  position: absolute;
  top: -10%;
  right: -8%;
  width: 640px;
  height: 520px;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 78% 0%, rgba(61, 111, 224, 0.22) 0%, transparent 46%),
    radial-gradient(circle at 100% 40%, rgba(255, 68, 50, 0.12) 0%, transparent 40%),
    radial-gradient(circle at 60% 70%, rgba(242, 144, 61, 0.09) 0%, transparent 42%);
  filter: blur(10px);
  z-index: 0;
}

.pdyye-brand-row {
  padding: 0 0 4px 0;
}

.pdyye-wordmark {
  font-family: 'Instrument Serif', serif !important;
  font-size: 1.2rem !important;
  font-weight: 400 !important;
  letter-spacing: -0.01em;
  color: ${TOKENS.paper} !important;
}

.pdyye-footnote,
.pdyye-footnote a,
.pdyye-footnote span,
.pdyye-footnote p {
  color: rgba(246, 242, 233, 0.5) !important;
}

.pdyye-footnote a {
  color: ${TOKENS.paper} !important;
  text-decoration: underline;
}

.pdyye-cover-tag {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 2;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${TOKENS.paper};
  background: rgba(13, 12, 11, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 4px 10px;
  border-radius: 999px;
  backdrop-filter: blur(6px);
}

.login-split-grid {
  container-type: inline-size;
  container-name: login-split;
  padding: var(--spacing-8, 2rem);
}
.login-split-image {
  position: relative;
  width: 100%;
  order: 0;
  min-height: 240px;
}
@container login-split (max-width: 550px) {
  .login-split-grid {
    padding: var(--spacing-4, 1rem);
  }
  .login-split-image {
    order: -1;
    height: 180px;
  }
}
@media (max-width: 640px) {
  body {
    padding: 0;
  }
  .login-split-grid {
    padding: 1rem !important;
  }
  .cl-card {
    width: 100% !important;
    max-width: 100% !important;
  }
  .cl-main {
    width: 100% !important;
  }
}

/* Clerk overrides. These class names are Clerk's own documented
   "appearance" hooks (the cl- prefix is stable across versions), so
   this part is safe to target directly regardless of what astryx's own
   components look like internally. */
.cl-headerTitle {
  display: none !important;
}
.cl-headerSubtitle {
  font-size: 0.9rem !important;
  color: rgba(246, 242, 233, 0.55) !important;
  font-family: 'Manrope', sans-serif !important;
}
.cl-card {
  box-shadow: none !important;
  border: none !important;
  background-color: transparent !important;
}
.cl-logoBox {
  height: 40px !important;
  margin-bottom: 1rem !important;
}
.cl-logoImage {
  height: 40px !important;
  width: auto !important;
  object-fit: contain !important;
}
.cl-formFieldLabel {
  color: rgba(246, 242, 233, 0.7) !important;
  font-family: 'Manrope', sans-serif !important;
  font-size: 13px !important;
}
.cl-formFieldInput {
  background-color: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid ${TOKENS.line} !important;
  color: ${TOKENS.paper} !important;
  border-radius: 10px !important;
  box-shadow: none !important;
}
.cl-formFieldInput:focus {
  border-color: ${TOKENS.plateBlue} !important;
  box-shadow: 0 0 0 1px ${TOKENS.plateBlue} !important;
}
.cl-formButtonPrimary {
  background-color: ${TOKENS.plateBlue} !important;
  border-radius: 999px !important;
  box-shadow: none !important;
  font-family: 'Manrope', sans-serif !important;
  font-weight: 600 !important;
}
.cl-formButtonPrimary:hover {
  background-color: #5c8aec !important;
}
.cl-socialButtonsBlockButton {
  background-color: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid ${TOKENS.line} !important;
  border-radius: 10px !important;
  color: ${TOKENS.paper} !important;
  box-shadow: none !important;
}
.cl-socialButtonsBlockButton:hover {
  background-color: rgba(255, 255, 255, 0.06) !important;
}
.cl-dividerLine {
  background-color: ${TOKENS.line} !important;
}
.cl-dividerText {
  color: rgba(246, 242, 233, 0.4) !important;
  font-family: 'IBM Plex Mono', monospace !important;
  font-size: 11px !important;
  text-transform: uppercase !important;
  letter-spacing: 0.06em !important;
}
.cl-footerActionText {
  color: rgba(246, 242, 233, 0.5) !important;
  font-family: 'Manrope', sans-serif !important;
}
.cl-footerActionLink {
  color: ${TOKENS.plateBlue} !important;
  font-family: 'Manrope', sans-serif !important;
}
.cl-identityPreviewText,
.cl-identityPreviewEditButton {
  color: rgba(246, 242, 233, 0.7) !important;
}
.cl-formFieldErrorText {
  color: #ff6b57 !important;
}
`;

export default function LoginPage() {
  return (
    <Center axis="both" style={pageStyle} className="pdyye-login-page">
      <style>{LOGIN_SPLIT_CSS}</style>
      <div className="pdyye-ink-bleed" aria-hidden="true" />
      <VStack gap={4} width="100%">
        <div style={cardWrap}>
          <Card padding={0} width="100%" style={cardSurfaceStyle}>
            <Grid
              columns={{ minWidth: COLUMN_MIN_WIDTH, repeat: 'fit' }}
              gap={8}
              align="stretch"
              className="login-split-grid">

              {/* Form Side */}
              <Section variant="transparent" padding={0} height="100%">
                <VStack gap={4} height="100%">
                  <HStack gap={2} vAlign="center" className="pdyye-brand-row">
                    <img src="/logo.png" alt="Pdyye logo mark" width={32} height={32} style={{ objectFit: 'contain' }} />
                    <Text type="body" weight="bold" className="pdyye-wordmark">
                      Pdyye
                    </Text>
                  </HStack>

                  <StackItem size="fill">
                    <Center axis="both" height="100%">
                      <SignIn
                        routing="hash"
                        appearance={{
                          variables: {
                            colorPrimary: TOKENS.plateBlue,
                            colorBackground: 'transparent',
                            colorText: TOKENS.paper,
                            colorTextSecondary: 'rgba(246, 242, 233, 0.6)',
                            colorInputBackground: 'rgba(255, 255, 255, 0.04)',
                            colorInputText: TOKENS.paper,
                            colorDanger: '#ff6b57',
                            borderRadius: '10px',
                            fontFamily: 'Manrope, sans-serif',
                          } as any, //
                        }}
                      />
                    </Center>
                  </StackItem>

                  <Text type="supporting" color="secondary" className="pdyye-footnote">
                    Don&apos;t have an account?{' '}
                    <Link href="#/signup" type="supporting">
                      Sign up
                    </Link>
                  </Text>
                </VStack>
              </Section>

              <div className="login-split-image">
                <Card
                  variant="transparent"
                  padding={0}
                  width="100%"
                  height="100%">
                  <img
                    style={coverImage}
                    src={COVER_IMAGE_URL}
                    alt="An anime character portrait generated and layer-separated in Pdyye"
                  />
                </Card>
                <span className="pdyye-cover-tag">Made with Pdyye</span>
              </div>

            </Grid>
          </Card>
        </div>

        <VStack hAlign="center">
          <Text type="supporting" color="secondary" className="pdyye-footnote">
            By continuing, you agree to Pdyye&apos;s{' '}
            <Link href="#" type="supporting">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="#" type="supporting">
              Privacy Policy
            </Link>
            .
          </Text>
        </VStack>
      </VStack>
    </Center>
  );
}