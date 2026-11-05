import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-400-italic.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import './styles.css';

import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import AskView from './views/AskView.vue';
import BackupView from './views/BackupView.vue';
import GraphView from './views/GraphView.vue';
import LibraryView from './views/LibraryView.vue';
import MapView from './views/MapView.vue';
import WizardView from './views/WizardView.vue';

// Keep in step with isClientRoute in src/worker/headers.ts.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LibraryView },
    { path: '/new', component: WizardView },
    { path: '/graph', component: GraphView },
    { path: '/ask', component: AskView },
    { path: '/backup', component: BackupView },
    { path: '/maps/:id', component: MapView },
    { path: '/maps/:id/edit', component: WizardView },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

createApp(App).use(router).mount('#app');
