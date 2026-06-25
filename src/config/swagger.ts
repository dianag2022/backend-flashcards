import { Application } from 'express';
import swaggerUi from 'swagger-ui-express';

const port = process.env.PORT || '4000';
const baseUrl = process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`;

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Psychology Flashcards API',
    version: '1.0.0',
    description: `
REST API for the Psychology Flashcards digital ecosystem (Phase 2 — Backend & Infrastructure).

## Authentication

Protected routes use **Firebase ID Tokens** sent in the \`Authorization\` header:

\`\`\`
Authorization: Bearer <firebase-id-token>
\`\`\`

The backend verifies tokens with Firebase Admin SDK (\`auth.verifyIdToken\`). Role-based access uses a custom claim \`role\`:

| Role | Access |
|------|--------|
| \`admin\` | Web admin panel — create decks/flashcards, publish content |
| \`end-user\` | Mobile app — read published content (when auth is enabled on public routes) |

Assign admin role for testing: \`npm run set-admin-role -- <firebase-uid>\` (developer fallback only).

For clients, use \`/api/auth/sign-up-admin\` or \`/api/auth/promote-to-admin\` with \`ADMIN_SETUP_SECRET\` instead of CLI commands.

## Sign in / Sign out

Use \`POST /api/auth/sign-up\` to register a mobile end-user account (\`role: end-user\`).
Use \`POST /api/auth/sign-up-admin\` to register a web admin account (\`role: admin\`) with the server \`ADMIN_SETUP_SECRET\`.
Use \`POST /api/auth/promote-to-admin\` to upgrade an existing account to admin using email, password, and \`ADMIN_SETUP_SECRET\`.
Use \`POST /api/auth/sign-in\` with email and password to obtain Firebase tokens from the backend.
Use \`POST /api/auth/forgot-password\` to email a password reset link.
Use \`POST /api/auth/reset-password\` to set a new password using the \`oobCode\` from that email.
Use \`POST /api/auth/sign-out\` with a Bearer token to revoke refresh tokens server-side.
    `.trim(),
  },
  servers: [
    {
      url: baseUrl,
      description: process.env.RENDER_EXTERNAL_URL ? 'Production (Render)' : 'Local development',
    },
  ],
  tags: [
    { name: 'Health', description: 'Service health checks' },
    { name: 'Auth', description: 'Firebase authentication — sign in and sign out' },
    { name: 'Public', description: 'Read-only endpoints for mobile / public clients' },
    { name: 'Admin', description: 'Write operations — requires admin role' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Firebase ID Token obtained after client sign-in',
      },
    },
    schemas: {
      ContentStatus: {
        type: 'string',
        enum: ['draft', 'published'],
      },
      Deck: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'abc123' },
          title: { type: 'string', example: 'Cognitive Psychology' },
          description: { type: 'string', example: 'Core concepts and definitions' },
          status: { $ref: '#/components/schemas/ContentStatus' },
          cardCount: { type: 'integer', example: 12 },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'title', 'description', 'status', 'cardCount', 'updatedAt'],
      },
      Flashcard: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'card456' },
          deckId: { type: 'string', example: 'abc123' },
          front: { type: 'string', example: 'What is working memory?' },
          back: { type: 'string', example: 'A limited-capacity system for temporary information storage.' },
          status: { $ref: '#/components/schemas/ContentStatus' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'deckId', 'front', 'back', 'status', 'createdAt'],
      },
      CreateDeckBody: {
        type: 'object',
        properties: {
          title: { type: 'string', example: 'Cognitive Psychology' },
          description: { type: 'string', example: 'Core concepts and definitions' },
        },
        required: ['title', 'description'],
      },
      CreateFlashcardBody: {
        type: 'object',
        properties: {
          deckId: { type: 'string', example: 'abc123' },
          front: { type: 'string', example: 'What is working memory?' },
          back: { type: 'string', example: 'A limited-capacity system for temporary information storage.' },
        },
        required: ['deckId', 'front', 'back'],
      },
      UpdateFlashcardsStatusBody: {
        type: 'object',
        properties: {
          flashcardIds: {
            type: 'array',
            items: { type: 'string' },
            example: ['cardId1', 'cardId2'],
          },
        },
        required: ['flashcardIds'],
      },
      DeckListResponse: {
        type: 'object',
        properties: {
          decks: {
            type: 'array',
            items: { $ref: '#/components/schemas/Deck' },
          },
        },
      },
      DeckResponse: {
        type: 'object',
        properties: {
          deck: { $ref: '#/components/schemas/Deck' },
        },
      },
      FlashcardListResponse: {
        type: 'object',
        properties: {
          flashcards: {
            type: 'array',
            items: { $ref: '#/components/schemas/Flashcard' },
          },
        },
      },
      FlashcardResponse: {
        type: 'object',
        properties: {
          flashcard: { $ref: '#/components/schemas/Flashcard' },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          service: { type: 'string', example: 'backend-flashcard' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Unauthorized' },
          message: { type: 'string', example: 'Invalid or expired Firebase ID token' },
        },
      },
      SignUpBody: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', format: 'password', example: 'secret123', minLength: 6 },
        },
        required: ['email', 'password'],
      },
      AdminSetupBody: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@example.com' },
          password: { type: 'string', format: 'password', example: 'secret123', minLength: 6 },
          setupSecret: {
            type: 'string',
            description: 'Must match server env var ADMIN_SETUP_SECRET',
            example: 'your-admin-setup-secret',
          },
        },
        required: ['email', 'password', 'setupSecret'],
      },
      SignInBody: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', format: 'password', example: 'your-password' },
        },
        required: ['email', 'password'],
      },
      SignInResponse: {
        type: 'object',
        properties: {
          uid: { type: 'string', example: 'firebase-uid' },
          email: { type: 'string', example: 'user@example.com' },
          idToken: { type: 'string', description: 'Firebase ID token — use as Bearer token' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'string', example: '3600' },
          role: { type: 'string', enum: ['admin', 'end-user'], nullable: true },
        },
      },
      SignOutResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Signed out successfully. Refresh tokens revoked; discard stored credentials on the client.' },
        },
      },
      ForgotPasswordBody: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
        },
        required: ['email'],
      },
      ResetPasswordBody: {
        type: 'object',
        properties: {
          oobCode: {
            type: 'string',
            description: 'Reset code from the Firebase password reset email link (query param `oobCode`)',
            example: 'ABC123_reset_code_from_email',
          },
          newPassword: { type: 'string', format: 'password', minLength: 6, example: 'newSecret123' },
        },
        required: ['oobCode', 'newPassword'],
      },
      MessageResponse: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
    },
  },
  paths: {
    '/api/auth/sign-up': {
      post: {
        tags: ['Auth'],
        summary: 'Sign up with email and password',
        description:
          'Creates a new Firebase Auth user, assigns custom claim `role: end-user`, and returns tokens. Requires `FIREBASE_WEB_API_KEY` on the server.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SignUpBody' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Account created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignInResponse' },
              },
            },
          },
          '400': {
            description: 'Invalid request body or weak password',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '409': {
            description: 'Email already registered',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/auth/sign-up-admin': {
      post: {
        tags: ['Auth'],
        summary: 'Sign up as admin (web panel)',
        description:
          'Creates a Firebase user and assigns `role: admin`. Requires `setupSecret` matching server `ADMIN_SETUP_SECRET`. No CLI needed.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminSetupBody' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Admin account created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignInResponse' },
              },
            },
          },
          '403': {
            description: 'Invalid setup secret',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '409': {
            description: 'Email already registered — use promote-to-admin instead',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/auth/promote-to-admin': {
      post: {
        tags: ['Auth'],
        summary: 'Promote existing user to admin',
        description:
          'Verifies email/password, assigns `role: admin`, and returns a fresh token with the admin claim.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminSetupBody' },
            },
          },
        },
        responses: {
          '200': {
            description: 'User promoted to admin',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignInResponse' },
              },
            },
          },
          '401': {
            description: 'Invalid email or password',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'Invalid setup secret',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/auth/sign-in': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in with email and password',
        description:
          'Authenticates against Firebase Auth and returns ID token, refresh token, and user role (from custom claims). Requires `FIREBASE_WEB_API_KEY` on the server.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SignInBody' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Signed in successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignInResponse' },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'Account disabled',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '429': {
            description: 'Too many attempts',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request password reset email',
        description:
          'Sends a Firebase password reset email. Always returns success to avoid revealing whether the email exists.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForgotPasswordBody' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Reset email sent if account exists',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageResponse' },
              },
            },
          },
          '400': { description: 'Invalid request body' },
        },
      },
    },
    '/api/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Complete password reset',
        description:
          'Sets a new password using the `oobCode` from the reset link in the email. After success, sign in with the new password.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResetPasswordBody' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Password updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageResponse' },
              },
            },
          },
          '400': { description: 'Invalid or expired reset code, or weak password' },
        },
      },
    },
    '/api/auth/sign-out': {
      post: {
        tags: ['Auth'],
        summary: 'Sign out',
        description:
          'Revokes Firebase refresh tokens for the authenticated user. Client must discard stored tokens locally.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Signed out successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignOutResponse' },
              },
            },
          },
          '401': {
            description: 'Missing or invalid token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns service status. No authentication required.',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/api/decks': {
      get: {
        tags: ['Public'],
        summary: 'List published decks',
        description:
          'Returns all decks with `status: published`. Currently public (no auth). Intended for mobile clients.',
        responses: {
          '200': {
            description: 'List of published decks',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeckListResponse' },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/decks/{deckId}/flashcards': {
      get: {
        tags: ['Public'],
        summary: 'List published flashcards for a deck',
        description:
          'Returns published flashcards for a published deck. Returns 404 if the deck is missing or not published.',
        parameters: [
          {
            name: 'deckId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Firestore document ID of the deck',
          },
        ],
        responses: {
          '200': {
            description: 'List of published flashcards',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FlashcardListResponse' },
              },
            },
          },
          '404': {
            description: 'Published deck not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/admin/decks': {
      post: {
        tags: ['Admin'],
        summary: 'Create a new deck',
        description: 'Creates a deck with `status: draft` and `cardCount: 0`. Requires `role: admin` custom claim.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateDeckBody' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Deck created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeckResponse' },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Missing or invalid Firebase ID token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'User lacks admin role',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/admin/flashcards': {
      post: {
        tags: ['Admin'],
        summary: 'Create a flashcard',
        description:
          'Creates a draft flashcard linked to a deck and increments the deck `cardCount`. Requires `role: admin`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateFlashcardBody' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Flashcard created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FlashcardResponse' },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Missing or invalid Firebase ID token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'User lacks admin role',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '404': {
            description: 'Deck not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/admin/decks/{deckId}/flashcards': {
      get: {
        tags: ['Admin'],
        summary: 'List all flashcards in a deck (admin)',
        description:
          'Returns draft and published flashcards for any deck. Use this to select cards to publish or draft.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'deckId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'All flashcards in the deck',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FlashcardListResponse' },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Deck not found' },
        },
      },
    },
    '/api/admin/decks/{deckId}/flashcards/publish': {
      put: {
        tags: ['Admin'],
        summary: 'Publish selected flashcards',
        description:
          'Sets `status: published` on selected cards in a deck. Works for published or draft decks. Mobile clients only see cards when the deck is also published.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'deckId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateFlashcardsStatusBody' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Flashcards published',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FlashcardListResponse' },
              },
            },
          },
          '400': { description: 'Invalid body or cards belong to another deck' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Deck or flashcard not found' },
        },
      },
    },
    '/api/admin/decks/{deckId}/flashcards/draft': {
      put: {
        tags: ['Admin'],
        summary: 'Move selected flashcards to draft',
        description:
          'Sets `status: draft` on selected cards. Removes them from the mobile app if the deck is published.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'deckId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateFlashcardsStatusBody' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Flashcards moved to draft',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FlashcardListResponse' },
              },
            },
          },
          '400': { description: 'Invalid body or cards belong to another deck' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Deck or flashcard not found' },
        },
      },
    },
    '/api/admin/decks/{id}/publish': {
      put: {
        tags: ['Admin'],
        summary: 'Publish a deck',
        description:
          'Sets deck `status` to `published`. Triggers Firestore real-time listeners on mobile clients. Requires `role: admin`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Firestore document ID of the deck',
          },
        ],
        responses: {
          '200': {
            description: 'Deck published',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeckResponse' },
              },
            },
          },
          '401': {
            description: 'Missing or invalid Firebase ID token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'User lacks admin role',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '404': {
            description: 'Deck not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
};

const swaggerUiOptions = {
  customSiteTitle: 'Psychology Flashcards API',
  swaggerOptions: {
    url: '/api/docs.json',
  },
};

function fixSwaggerAssetPaths(html: string): string {
  return html.replace(/"\.\//g, '"/api/docs/');
}

export function setupSwagger(app: Application): void {
  app.get('/api/docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });

  app.use('/api/docs', ...swaggerUi.serveFiles(swaggerSpec, swaggerUiOptions));

  app.get(['/api/docs', '/api/docs/'], (_req, res) => {
    const html = swaggerUi.generateHTML(swaggerSpec, swaggerUiOptions);
    res.type('html').send(fixSwaggerAssetPaths(html));
  });
}
