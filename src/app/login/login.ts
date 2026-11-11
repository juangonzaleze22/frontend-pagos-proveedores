import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MessageService } from 'primeng/api';
import { AuthService } from '../shared/services/auth.service';
import { BrandingService } from '../shared/services/branding.service';

/**
 * Convierte errores técnicos de login en mensajes amigables para el usuario.
 */
function getMensajeAmigableLogin(error: unknown): string {
  const msg = typeof (error as any)?.message === 'string' ? (error as any).message : '';
  const status = (error as HttpErrorResponse)?.status;

  // Error de red / servidor inalcanzable (status 0, Unknown Error, CORS, etc.)
  if (status === 0 || msg.includes('Error Code: 0') || msg.includes('Http failure') || msg.includes('Unknown Error')) {
    return 'No se pudo conectar con el servidor. Comprueba tu conexión a internet o inténtalo más tarde.';
  }
  if (status === 401) {
    return 'Correo o contraseña incorrectos.';
  }
  if (status === 403) {
    return 'No tienes permiso para acceder.';
  }
  if (status === 404 || (status && status >= 500)) {
    return 'El servicio no está disponible. Inténtalo más tarde.';
  }
  // Mensaje ya amigable de la API (ej. "Credenciales inválidas")
  if (msg && !msg.includes('Error Code:') && !msg.includes('Message:')) {
    return msg;
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CommonModule,
    CardModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
    ToastModule,
    IconFieldModule,
    InputIconModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  providers: [MessageService]
})
export class Login {
  loginForm: FormGroup;
  isLoading = signal(false);
  private authService = inject(AuthService);
  public branding = inject(BrandingService);

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private messageService: MessageService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit() {
    if (this.loginForm.valid) {
      this.isLoading.set(true);
      
      this.authService.login(
        this.loginForm.value.email,
        this.loginForm.value.password
      ).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Éxito',
            detail: 'Inicio de sesión exitoso'
          });
          this.isLoading.set(false);
          this.router.navigate(['/dashboard']);
        },
        error: (error) => {
          this.isLoading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: getMensajeAmigableLogin(error)
          });
        }
      });
    } else {
      // Marcar todos los campos como touched para mostrar errores
      Object.keys(this.loginForm.controls).forEach(key => {
        this.loginForm.get(key)?.markAsTouched();
      });
    }
  }
}
