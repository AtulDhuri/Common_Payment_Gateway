// FILE: modules/users/users.repository.ts
// PURPOSE: DB access for users. Users are the tenant root, so no tenantId filter
// DEPENDENCIES: User entity
// PHASE: 2
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersRepository {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(email: string, passwordHash: string): Promise<User> {
    return this.repo.save(this.repo.create({ email, passwordHash }));
  }
}
