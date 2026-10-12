import { defineConfig } from 'wxt';
import { marketplaceHostPermissions } from './utils/marketplace/marketplaces';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage', 'tabs', 'scripting'],
    host_permissions: marketplaceHostPermissions(),
  },
});
