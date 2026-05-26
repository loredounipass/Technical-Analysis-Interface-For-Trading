import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function IndicatorCard({ title, icon, children }) {
  return (
    <Card className="trading-card border border-white/5 bg-[#0a0e14]/80 backdrop-blur-sm relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-50" />
      <CardHeader className="pb-2 relative z-10 border-b border-white/[0.02]">
        <CardTitle className="text-gray-400 text-[10px] tracking-widest flex items-center font-mono uppercase">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 relative z-10">{children}</CardContent>
    </Card>
  )
}
