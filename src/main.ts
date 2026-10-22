import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

Sentry.init({
  dsn: 'https://9028d0f0b30386836bd05358bece8d30@o4512295315898368.ingest.de.sentry.io/4512295340474448',
  tracesSampleRate: 1.0,
});

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));