import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { type VariantProps, cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

export type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-primary-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue-400 hover:bg-blue-300',
        outline: 'border border-neutral-700 bg-transparent hover:bg-neutral-700',
        secondary: 'bg-neutral-750 hover:bg-neutral-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Button({ className, variant = 'default', ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
