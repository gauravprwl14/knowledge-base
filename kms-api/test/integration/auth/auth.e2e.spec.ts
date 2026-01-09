import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { TestDatabaseHelper } from '../../helpers/test-database.helper';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let dbHelper: TestDatabaseHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply global pipes
    app.useGlobalPipes(new ValidationPipe());

    await app.init();

    dbHelper = new TestDatabaseHelper();
    await dbHelper.connect();
  });

  afterAll(async () => {
    await dbHelper.disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await dbHelper.cleanDatabase();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          confirmPassword: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('email', 'test@example.com');
          expect(res.body.data).not.toHaveProperty('passwordHash');
        });
    });

    it('should return 400 for invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        })
        .expect(400);
    });

    it('should return 400 for weak password', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
          confirmPassword: 'weak',
        })
        .expect(400);
    });
  });

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      // Register a user first
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'login@example.com',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        });

      // Manually activate the user (in real app, would be via email verification)
      const prisma = dbHelper.getClient();
      await prisma.user.update({
        where: { email: 'login@example.com' },
        data: { status: 'ACTIVE' },
      });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Password123!',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body.data).toHaveProperty('tokens');
          expect(res.body.data.tokens).toHaveProperty('accessToken');
          expect(res.body.data.tokens).toHaveProperty('refreshToken');
          expect(res.body.data).toHaveProperty('user');
        });
    });

    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });
  });

  describe('/health/live (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'ok');
        });
    });
  });
});
