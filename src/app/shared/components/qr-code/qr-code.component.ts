import {
  Component,
  ChangeDetectionStrategy,
  input,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import QRCode from 'qrcode';

@Component({
  selector: 'maranth-qr-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="inline-flex flex-col items-center justify-center p-1 bg-white border border-slate-300 rounded shadow-xs">
      <canvas #qrCanvas class="block"></canvas>
      @if (caption()) {
        <span class="text-[9px] font-mono text-slate-500 mt-1 uppercase tracking-tight text-center">{{ caption() }}</span>
      }
    </div>
  `,
})
export class QrCodeComponent {
  // Inputs using modern Angular signal inputs
  public readonly data = input.required<string>();
  public readonly size = input<number>(110);
  public readonly caption = input<string>('myDATA AADE Verify');

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');

  constructor() {
    effect(() => {
      const url = this.data();
      const canvasEl = this.canvasRef()?.nativeElement;
      const dimension = this.size();

      if (url && canvasEl) {
        QRCode.toCanvas(
          canvasEl,
          url,
          {
            width: dimension,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
            errorCorrectionLevel: 'M',
          },
          (error) => {
            if (error) {
              console.error('Error rendering AADE QR code:', error);
            }
          }
        );
      }
    });
  }
}