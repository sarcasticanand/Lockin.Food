import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[#2D4A3E]/10 text-[#2D4A3E]',
        sage: 'bg-[#7BA088]/15 text-[#4a7060]',
        amber: 'bg-[#D4A574]/20 text-[#8a6030]',
        coral: 'bg-[#E89B7C]/20 text-[#b05a30]',
        terracotta: 'bg-[#C66B5C]/15 text-[#c66b5c]',
        outline: 'border border-[#D8D4CC] text-[#6B7268]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
