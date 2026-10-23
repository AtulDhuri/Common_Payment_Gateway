// FILE: modules/crypto/crypto.module.ts
// PURPOSE: Exposes CryptoService
// DEPENDENCIES: CryptoService
// PHASE: 4
import { Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';

@Module({ providers: [CryptoService], exports: [CryptoService] })
export class CryptoModule {}
