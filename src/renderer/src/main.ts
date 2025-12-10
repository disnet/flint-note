import { mount } from 'svelte';

import './assets/main.css';
import './assets/fonts.css';

import App from './AutomergeApp.svelte';

const app = mount(App, {
  target: document.getElementById('app')!
});

export default app;
