// Re-export the dashboard screen directly so it renders inside the tab
// (using <Redirect> causes an infinite update loop in Expo Router tabs)
export { default } from '../dashboard'
