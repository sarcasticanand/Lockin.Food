'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-95',
  {
    variants: {
      variant: {
        default: 'bg-[#1A1F1B] text-white hover:bg-[#2D4A3E] shadow-sm',
        coral: 'bg-[#E89B7C] text-white hover:bg-[#d9845f] shadow-sm',
        outline: 'border border-[#1A1F1B] text-[#1A1F1B] bg-white hover:bg-[#1A1F1B]/5',
        ghost: 'text-[#6B7268] hover:bg-[#2D4A3E]/8 hover:text-[#2D4A3E]',
        destructive: 'bg-[#C66B5C] text-white hover:bg-[#b55c4d]',
        secondary: 'bg-white border border-[#1A1F1B] text-[#1A1F1B] hover:bg-[#1A1F1B]/5',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-13 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
