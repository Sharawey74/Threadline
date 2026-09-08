import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library registers its own cleanup only when vitest runs with
// globals enabled. This project keeps globals off - every import explicit - so
// the cleanup is wired here instead.
//
// Without it, each render stacks another copy of the component in the same
// document and queries start finding several matches. That surfaces as
// "found multiple elements", which reads like a component bug and is not one.
afterEach(cleanup);
