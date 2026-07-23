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

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: 'var(--color-background-body, #0b0b0c)',
  padding: 'var(--spacing-6, 1.5rem)',
};

const cardWrap: CSSProperties = {
  width: '100%',
  maxWidth: 1000,
  marginInline: 'auto',
};

const coverImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const LOGIN_SPLIT_CSS = `
.login-split-grid {
  container-type: inline-size;
  container-name: login-split;
  padding: var(--spacing-8, 2rem);
}
.login-split-image {
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
/* Clerk Card & Logo Styling Overrides */
.cl-headerTitle {
  display: none !important;
}
.cl-headerSubtitle {
  font-size: 0.9rem !important;
  color: #a1a1aa !important;
}
.cl-card {
  box-shadow: none !important;
  border: none !important;
  background-color: transparent !important;
}
.cl-logoBox {
  height: 48px !important;
  margin-bottom: 1rem !important;
}
.cl-logoImage {
  height: 48px !important;
  width: auto !important;
  object-fit: contain !important;
}
`;

export default function LoginPage() {
  return (
    <Center axis="both" style={pageStyle}>
      <style>{LOGIN_SPLIT_CSS}</style>
      <VStack gap={4} width="100%">
        <div style={cardWrap}>
          <Card padding={0} width="100%">
            <Grid
              columns={{ minWidth: COLUMN_MIN_WIDTH, repeat: 'fit' }}
              gap={8}
              align="stretch"
              className="login-split-grid">
              
              {/* Form Side */}
              <Section variant="transparent" padding={0} height="100%">
                <VStack gap={4} height="100%">
                  <HStack gap={2} vAlign="center">
                    <img src="/logo.png" alt="Pdyee Logo" width={36} height={36} style={{ objectFit: 'contain' }} />
                    <Text type="body" weight="bold">
                      Pdyee AI
                    </Text>
                  </HStack>

                  <StackItem size="fill">
                    <Center axis="both" height="100%">
                      <SignIn
                        routing="hash"
                        appearance={{
                          variables: {
                            colorPrimary: "#ffffff",
                            colorBackground: "#18181b",
                          },
                        }}
                      />
                    </Center>
                  </StackItem>

                  <Text type="supporting" color="secondary">
                    Don&apos;t have an account?{' '}
                    <Link href="#/signup" type="supporting">
                      Sign up
                    </Link>
                  </Text>
                </VStack>
              </Section>

              {/* Galaxy Cover Image Side */}
              <div className="login-split-image">
                <Card
                  variant="transparent"
                  padding={0}
                  width="100%"
                  height="100%">
                  <img
                    style={coverImage}
                    src={COVER_IMAGE_URL}
                    alt="Anime Character near Galaxy Planet"
                  />
                </Card>
              </div>

            </Grid>
          </Card>
        </div>

        <VStack hAlign="center">
          <Text type="supporting" color="secondary">
            By continuing, you agree to Pdyee AI&apos;s{' '}
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
