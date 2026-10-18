import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom has no object URLs; the viewer only needs a string to put in an image.
URL.createObjectURL = () => 'blob:test';
URL.revokeObjectURL = () => undefined;
window.scrollTo = () => undefined;
