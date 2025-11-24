import z from "zod"
import type { MessageV2 } from "../session/message-v2"

export namespace Tool {
  interface Metadata {
    [key: string]: any
  }

  export type Context<M extends Metadata = Metadata> = {
    sessionID: string
    messageID: string
    agent: string
    abort: AbortSignal
    callID?: string
    extra?: { [key: string]: any }
    metadata(input: { title?: string; metadata?: M }): void
  }

  /**
   * Example input for a tool, used to demonstrate correct usage patterns.
   * These examples help the model understand when to include optional parameters,
   * which combinations make sense, and what conventions the API expects.
   */
  export type InputExample = Record<string, unknown>

  export interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    id: string
    init: () => Promise<{
      description: string
      parameters: Parameters
      /**
       * Optional examples of valid tool inputs.
       * These are passed to Anthropic models as input_examples to improve
       * tool call accuracy for complex parameter handling.
       */
      inputExamples?: InputExample[]
      execute(
        args: z.infer<Parameters>,
        ctx: Context,
      ): Promise<{
        title: string
        metadata: M
        output: string
        attachments?: MessageV2.FilePart[]
      }>
      formatValidationError?(error: z.ZodError): string
    }>
  }

  export type InferParameters<T extends Info> = T extends Info<infer P> ? z.infer<P> : never
  export type InferMetadata<T extends Info> = T extends Info<any, infer M> ? M : never

  export function define<Parameters extends z.ZodType, Result extends Metadata>(
    id: string,
    init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
  ): Info<Parameters, Result> {
    return {
      id,
      init: async () => {
        const toolInfo = init instanceof Function ? await init() : init
        const execute = toolInfo.execute
        toolInfo.execute = (args, ctx) => {
          try {
            toolInfo.parameters.parse(args)
          } catch (error) {
            if (error instanceof z.ZodError && toolInfo.formatValidationError) {
              throw new Error(toolInfo.formatValidationError(error), { cause: error })
            }
            throw new Error(
              `The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`,
              { cause: error },
            )
          }
          return execute(args, ctx)
        }
        return toolInfo
      },
    }
  }
}
