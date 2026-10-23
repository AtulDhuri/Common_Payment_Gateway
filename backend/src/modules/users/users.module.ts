// FILE: modules/users/users.module.ts
// PURPOSE: Wires the users entity and repository
// DEPENDENCIES: User, UsersRepository
// PHASE: 2
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersRepository } from './users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
