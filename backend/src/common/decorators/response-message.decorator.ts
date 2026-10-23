// FILE: common/decorators/response-message.decorator.ts
// PURPOSE: @ResponseMessage sets the envelope `message`
// DEPENDENCIES: none
// PHASE: 3
import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'responseMessage';
export const ResponseMessage = (message: string): MethodDecorator => SetMetadata(RESPONSE_MESSAGE_KEY, message);
