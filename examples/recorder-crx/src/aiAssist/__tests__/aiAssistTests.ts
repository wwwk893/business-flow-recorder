/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { causalWindowTests } from './causalWindow.test';
import { providerTests } from './provider.test';
import { redactorTests } from './redactor.test';
import { repairContextBuilderTests } from './repairContextBuilder.test';
import { repairLanPropagatedFailureTests } from './repairLanPropagatedFailure.test';
import { repairPatchSchemaTests } from './repairPatchSchema.test';
import { repairValidatorTests } from './repairValidator.test';
import { reviewContextBuilderTests } from './reviewContextBuilder.test';
import { reviewLanPropagatedRiskTests } from './reviewLanPropagatedRisk.test';
import { reviewPatchSchemaTests } from './reviewPatchSchema.test';
import { reviewPromptTests } from './reviewPrompt.test';
import { reviewValidatorTests } from './reviewValidator.test';
import type { AiAssistTestCase } from './testHelpers';

export const aiAssistTests: AiAssistTestCase[] = [
  ...redactorTests,
  ...providerTests,
  ...reviewContextBuilderTests,
  ...reviewPromptTests,
  ...reviewPatchSchemaTests,
  ...reviewValidatorTests,
  ...reviewLanPropagatedRiskTests,
  ...repairContextBuilderTests,
  ...causalWindowTests,
  ...repairPatchSchemaTests,
  ...repairValidatorTests,
  ...repairLanPropagatedFailureTests,
];
