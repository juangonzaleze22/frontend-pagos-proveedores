import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './shared/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('gestion-pagos-proveedores');

  constructor(private themeService: ThemeService) {
    // Inicializa el tema al arrancar (lee localStorage y preferencia del sistema)
  }
}
