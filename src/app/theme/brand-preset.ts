import { definePreset } from '@primeuix/themes';
import Lara from '@primeuix/themes/lara';

/**
 * Preset que extiende Lara y ajusta el dark mode a una paleta neutra
 * (negro + escala de grises zinc) sin tinte azul, con buen contraste.
 */
export const BrandPreset = definePreset(Lara, {
  semantic: {
    colorScheme: {
      dark: {
        surface: {
          0: '#ffffff',
          50: '{zinc.100}',
          100: '{zinc.200}',
          200: '{zinc.300}',
          300: '{zinc.400}',
          400: '{zinc.500}',
          500: '{zinc.500}',
          600: '{zinc.600}',
          700: '#3f3f46',  // zinc-700 (cards/superficies)
          800: '#27272a',  // zinc-800
          900: '#18181b',  // zinc-900
          950: '#18181b'   // zinc-900 (fondo app más suave)
        },
        formField: {
          background: '#27272a',   // zinc-800
          disabledBackground: '{surface.700}',
          filledBackground: '{surface.700}',
          filledHoverBackground: '{surface.700}',
          filledFocusBackground: '{surface.950}',
          borderColor: '#52525b',  // zinc-600, bordes visibles
          hoverBorderColor: '{primary.color}',
          focusBorderColor: '{primary.color}',
          invalidBorderColor: '{red.400}',
          color: '{surface.0}',
          disabledColor: '{surface.400}',
          placeholderColor: '#a1a1aa',  // zinc-400
          invalidPlaceholderColor: '{red.400}',
          floatLabelColor: '{surface.400}',
          floatLabelFocusColor: '{primary.color}',
          floatLabelActiveColor: '{surface.400}',
          floatLabelInvalidColor: '{red.400}',
          iconColor: '{surface.400}',
          shadow: 'none'
        },
        content: {
          background: '{surface.800}',
          hoverBackground: '{surface.700}',
          borderColor: '#52525b',
          color: '{text.color}',
          hoverColor: '{text.hover.color}'
        },
        overlay: {
          select: {
            background: '{surface.800}',
            borderColor: '#52525b',
            color: '{text.color}'
          },
          popover: {
            background: '{surface.800}',
            borderColor: '#52525b',
            color: '{text.color}'
          },
          modal: {
            background: '{surface.800}',
            borderColor: '#52525b',
            color: '{text.color}'
          }
        },
        text: {
          color: '{surface.0}',
          hoverColor: '{surface.0}',
          mutedColor: '#a1a1aa',  // zinc-400
          hoverMutedColor: '{zinc.300}'
        }
      }
    }
  }
});
