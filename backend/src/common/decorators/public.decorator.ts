// FILE: common/decorators/public.decorator.ts
// PURPOSE: Mark routes that skip JWT auth (Public in api-design.md)
// DEPENDENCIES: none
// PHASE: 2
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
