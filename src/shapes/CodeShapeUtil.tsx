import { BaseBoxShapeUtil, T, type RecordProps, type TLShape } from 'tldraw'

const CODE_TYPE = 'code' as const

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [CODE_TYPE]: {
      w: number
      h: number
      code: string
    }
  }
}

export type CodeShape = TLShape<typeof CODE_TYPE>

/** Stub — full implementation in a separate issue. */
export class CodeShapeUtil extends BaseBoxShapeUtil<CodeShape> {
  static override type = CODE_TYPE
  static override props: RecordProps<CodeShape> = {
    w: T.number,
    h: T.number,
    code: T.string,
  }

  getDefaultProps(): CodeShape['props'] {
    return { w: 300, h: 200, code: '' }
  }

  component() {
    return null
  }

  indicator(shape: CodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}
