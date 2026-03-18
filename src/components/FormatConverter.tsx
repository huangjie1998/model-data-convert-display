import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRight, 
  AlertCircle,
  Lightbulb
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConversionStep {
  step: number;
  title: string;
  description: string;
}

interface FormatInfo {
  from: string;
  fromIcon: string;
  to: string;
  toIcon: string;
  steps: ConversionStep[];
  tools: string[];
  notes?: string;
}

const formatConversions: FormatInfo[] = [
  {
    from: 'SKP (SketchUp)',
    fromIcon: '📐',
    to: 'GLTF/GLB',
    toIcon: '🎨',
    steps: [
      { step: 1, title: '打开 SketchUp 模型', description: '在 SketchUp 中打开您的 .skp 文件' },
      { step: 2, title: '安装导出插件', description: '安装 SketchUp 的 glTF 导出插件（如 Khronos Group 的官方插件）' },
      { step: 3, title: '导出为 GLTF', description: '选择 文件 → 导出 → 3D模型，选择 GLTF 或 GLB 格式' },
      { step: 4, title: '上传文件', description: '将导出的文件上传到本网站查看' }
    ],
    tools: ['SketchUp Pro', 'Khronos glTF Export Plugin', 'SimLab Composer'],
    notes: 'GLTF 是推荐的3D格式，支持材质、纹理和动画'
  },
  {
    from: 'SKP (SketchUp)',
    fromIcon: '📐',
    to: 'OBJ',
    toIcon: '🔷',
    steps: [
      { step: 1, title: '打开 SketchUp 模型', description: '在 SketchUp 中打开您的 .skp 文件' },
      { step: 2, title: '选择导出', description: '选择 文件 → 导出 → 3D模型' },
      { step: 3, title: '选择 OBJ 格式', description: '在导出对话框中选择 OBJ 格式 (*.obj)' },
      { step: 4, title: '设置选项', description: '根据需要设置导出选项（单位、坐标等）' },
      { step: 5, title: '上传文件', description: '将导出的 .obj 文件上传到本网站' }
    ],
    tools: ['SketchUp Pro', 'SketchUp Free (Web)', 'SimLab Composer'],
    notes: 'OBJ 格式通用性强，但可能丢失材质信息'
  },
  {
    from: 'DWG (AutoCAD)',
    fromIcon: '📏',
    to: 'PDF',
    toIcon: '📄',
    steps: [
      { step: 1, title: '打开 AutoCAD 图纸', description: '在 AutoCAD 中打开您的 .dwg 文件' },
      { step: 2, title: '选择打印/导出', description: '选择 文件 → 打印 或 输出' },
      { step: 3, title: '选择 PDF 打印机', description: '选择 Adobe PDF 或 DWG To PDF.pc3 打印机' },
      { step: 4, title: '设置输出范围', description: '选择要输出的布局或窗口范围' },
      { step: 5, title: '保存 PDF', description: '选择保存位置并生成 PDF 文件' },
      { step: 6, title: '上传文件', description: '将生成的 PDF 上传到本网站查看' }
    ],
    tools: ['AutoCAD', 'AutoCAD LT', 'DWG TrueView (免费)', 'Any DWG to PDF Converter'],
    notes: 'PDF 是查看和分享图纸的最佳格式'
  },
  {
    from: 'DWG (AutoCAD)',
    fromIcon: '📏',
    to: 'DXF',
    toIcon: '📋',
    steps: [
      { step: 1, title: '打开 AutoCAD 图纸', description: '在 AutoCAD 中打开您的 .dwg 文件' },
      { step: 2, title: '另存为', description: '选择 文件 → 另存为' },
      { step: 3, title: '选择 DXF 格式', description: '在文件类型中选择 DXF 格式' },
      { step: 4, title: '选择版本', description: '选择合适的 DXF 版本（建议使用较新的版本）' },
      { step: 5, title: '保存文件', description: '选择保存位置并保存' },
      { step: 6, title: '上传文件', description: '将 .dxf 文件上传到本网站' }
    ],
    tools: ['AutoCAD', 'AutoCAD LT', 'DraftSight', 'LibreCAD'],
    notes: 'DXF 是 CAD 数据交换的标准格式'
  }
];

export function FormatConverter() {
  const [selectedConversion, setSelectedConversion] = useState<FormatInfo | null>(null);

  return (
    <div className="space-y-6">
      {/* 标题区域 */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-100">文件格式转换指南</h2>
        <p className="text-gray-400">
          由于浏览器限制，SKP 和 DWG 格式需要转换为支持的格式才能查看
        </p>
      </div>

      {/* 快速转换卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {formatConversions.map((conversion, index) => (
          <Card 
            key={index} 
            className="bg-gray-800 border-gray-700 hover:border-gray-600 transition-colors cursor-pointer"
            onClick={() => setSelectedConversion(conversion)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{conversion.fromIcon}</span>
                    <ArrowRight className="h-4 w-4 text-gray-500" />
                    <span className="text-2xl">{conversion.toIcon}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                  {conversion.steps.length} 步
                </Badge>
              </div>
              <CardTitle className="text-lg text-gray-100 mt-2">
                {conversion.from} → {conversion.to}
              </CardTitle>
              <CardDescription className="text-gray-400">
                {conversion.notes}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {conversion.tools.slice(0, 3).map((tool, i) => (
                  <span 
                    key={i}
                    className="text-xs px-2 py-1 bg-gray-700 rounded text-gray-400"
                  >
                    {tool}
                  </span>
                ))}
                {conversion.tools.length > 3 && (
                  <span className="text-xs px-2 py-1 bg-gray-700 rounded text-gray-400">
                    +{conversion.tools.length - 3}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 提示信息 */}
      <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-amber-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-400 mb-1">转换提示</h4>
            <ul className="text-sm text-amber-300/80 space-y-1">
              <li>• 转换前请备份原始文件</li>
              <li>• 复杂的材质和纹理可能需要重新调整</li>
              <li>• 建议使用最新版本的软件进行转换</li>
              <li>• 大型文件转换可能需要较长时间</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 详细步骤对话框 */}
      <Dialog open={!!selectedConversion} onOpenChange={() => setSelectedConversion(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="text-2xl">{selectedConversion?.fromIcon}</span>
              <ArrowRight className="h-5 w-5 text-gray-500" />
              <span className="text-2xl">{selectedConversion?.toIcon}</span>
              <span className="ml-2">
                {selectedConversion?.from} → {selectedConversion?.to}
              </span>
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {selectedConversion?.notes}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* 步骤列表 */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-200">转换步骤</h4>
              {selectedConversion?.steps.map((step) => (
                <div 
                  key={step.step}
                  className="flex gap-4 p-3 bg-gray-800 rounded-lg"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                    {step.step}
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-200">{step.title}</h5>
                    <p className="text-sm text-gray-400">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 推荐工具 */}
            <div>
              <h4 className="font-medium text-gray-200 mb-3">推荐工具</h4>
              <div className="flex flex-wrap gap-2">
                {selectedConversion?.tools.map((tool, i) => (
                  <Badge 
                    key={i}
                    variant="secondary"
                    className="bg-gray-800 text-gray-300 border border-gray-700"
                  >
                    {tool}
                  </Badge>
                ))}
              </div>
            </div>

            {/* 注意事项 */}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-400 mb-1">注意事项</h4>
                  <p className="text-sm text-blue-300/80">
                    转换过程中可能会丢失一些特定软件的专有数据。
                    建议在转换后仔细检查文件，确保所有重要信息都已正确保留。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
