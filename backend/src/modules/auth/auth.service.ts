// FILE: modules/auth/auth.service.ts
// PURPOSE: Register, login, access/refresh JWT issuing, refresh, current user
// DEPENDENCIES: UsersRepository, JwtService, AppConfig, bcrypt
// PHASE: 2
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/configuration';
import { UsersRepository } from '../users/users.repository';
import { User } from '../users/entities/user.entity';
import { LoginDto, RegisterDto, TokenResponse, UserResponse } from './dto/auth.dto';

const BCRYPT_COST = 12; // db-design.md
const PG_UNIQUE_VIOLATION = '23505';

export type TokenType = 'access' | 'refresh';
export interface TokenPayload {
  sub: string;
  email: string;
  type: TokenType;
}

@Injectable()
export class AuthService {
  // Compared against when the email is unknown, so timing does not reveal registered emails.
  private readonly dummyHash = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponse> {
    if (await this.users.findByEmail(dto.email)) this.emailTaken();
    const hash = await bcrypt.hash(dto.password, BCRYPT_COST);
    try {
      return this.toResponse(await this.users.create(dto.email, hash));
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) this.emailTaken();
      throw err;
    }
  }

  async login(dto: LoginDto): Promise<TokenResponse> {
    const user = await this.users.findByEmail(dto.email);
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? this.dummyHash);
    if (!user || !ok) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password', 401);
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    const payload = await this.verify(refreshToken, 'refresh');
    const user = await this.users.findById(payload.sub);
    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, 'Invalid refresh token', 401);
    return this.issueTokens(user);
  }

  async me(userId: string): Promise<UserResponse> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, 'User no longer exists', 401);
    return this.toResponse(user);
  }

  async verify(token: string, type: TokenType): Promise<TokenPayload> {
    const secret = type === 'access' ? this.config.jwt.accessSecret : this.config.jwt.refreshSecret;
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, { secret });
      if (payload.type !== type) throw new Error('wrong token type');
      return payload;
    } catch {
      throw new AppException(ErrorCode.UNAUTHORIZED, `Invalid or expired ${type} token`, 401);
    }
  }

  private async issueTokens(user: User): Promise<TokenResponse> {
    const base = { sub: user.id, email: user.email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ ...base, type: 'access' }, {
        secret: this.config.jwt.accessSecret,
        expiresIn: this.config.jwt.accessExpiresIn as never,
      }),
      this.jwt.signAsync({ ...base, type: 'refresh' }, {
        secret: this.config.jwt.refreshSecret,
        expiresIn: this.config.jwt.refreshExpiresIn as never,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private toResponse(user: User): UserResponse {
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }

  private emailTaken(): never {
    throw new AppException(ErrorCode.EMAIL_TAKEN, 'Email is already registered', 409);
  }
}
