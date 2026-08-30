import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentUserId } from "../common/current-user.decorator.js";
import { dateKeySchema, uuidSchema } from "../common/schemas.js";
import { zodPipe } from "../common/validation.pipe.js";
import {
  createAssignment,
  createSubmission,
  deleteAssignment,
  deleteAttachment,
  deleteSubmission,
  getSessionLearning,
  listPractice,
  setAssignmentCompletion,
  updateAssignment,
  writeFeedback,
  writeSessionNote,
  type AssignmentView,
  type AssignmentCompletionView,
  type FeedbackView,
  type PracticeItem,
  type SessionLearningView,
  type SubmissionView,
} from "./learning.service.js";

@Injectable()
export class LearningProvider {
  readonly session = getSessionLearning;
  readonly writeNote = writeSessionNote;
  readonly createAssignment = createAssignment;
  readonly updateAssignment = updateAssignment;
  readonly deleteAssignment = deleteAssignment;
  readonly deleteAttachment = deleteAttachment;
  readonly createSubmission = createSubmission;
  readonly deleteSubmission = deleteSubmission;
  readonly writeFeedback = writeFeedback;
  readonly practice = listPractice;
  readonly setCompletion = setAssignmentCompletion;
}

const noteSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "نکات جلسه نمی‌تواند خالی باشد")
    .max(8000, "نکات جلسه خیلی بلند است"),
});

/**
 * پیوست‌ها با **کلید آبجکت** می‌آیند نه با نشانی.
 *
 * اگر نشانی از کلاینت گرفته می‌شد، هر رشته‌ای — از جمله فایل کاربر
 * دیگر یا یک آدرس بیرونی که محتوایش عوض می‌شود — می‌توانست به‌عنوان
 * پیوست ثبت شود. کلید را API خودش صادر کرده و در ردیس به همان کاربر
 * گره خورده است.
 */
const attachmentSchema = z.object({
  objectKey: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(160),
});

const createAssignmentSchema = z.object({
  title: z.string().trim().min(1, "عنوان تمرین لازم است").max(160),
  description: z.string().trim().max(4000).optional(),
  dueDate: dateKeySchema.optional(),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

const updateAssignmentSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    dueDate: dateKeySchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "چیزی برای تغییر فرستاده نشده است",
  });

/** پیوستی که قرار است حذف شود، با همان نشانی‌ای که در فهرست آمده. */
const attachmentRefSchema = z.object({
  url: z.string().trim().min(1).max(500),
});

const submissionSchema = z.object({
  objectKey: z.string().trim().min(1).max(300),
  /** فرانت از خود فایل صوتی می‌خواندش؛ نبودنش خطا نیست */
  durationSeconds: z.number().int().min(0).max(24 * 3600).optional(),
});

const completionSchema = z.object({ completed: z.boolean() });

/**
 * دستِ‌کم یکی از متن یا صدا.
 *
 * قید `feedbacks_has_content` در دیتابیس هم همین را می‌گوید؛ اینجا با
 * پیام فارسی گرفته می‌شود تا به‌جای خطای ۵۰۰ قید، جمله‌ای برگردد که
 * می‌شود به کاربر نشان داد.
 */
const feedbackSchema = z
  .object({
    content: z.string().trim().max(4000).optional(),
    voiceObjectKey: z.string().trim().min(1).max(300).optional(),
  })
  .refine((value) => Boolean(value.content?.length) || Boolean(value.voiceObjectKey), {
    message: "بازخورد باید متن یا فایل صوتی داشته باشد",
  });

/**
 * حلقه‌ی یادگیری.
 *
 * ⚠️ هیچ مسیری `teacherId` یا `studentId` نمی‌گیرد. نقش کاربر از روی
 * خودِ رزرو تعیین می‌شود — همان قاعده‌ای که پنل استاد و پنل ادمین هم
 * رعایتش می‌کنند. اگر شناسه ورودی بود، هر کاربر واردشده‌ای می‌توانست
 * روی جلسه‌ی دیگران تمرین بگذارد یا بازخورد بنویسد.
 */
@Controller()
export class LearningController {
  constructor(private readonly learning: LearningProvider) {}

  /** کل حلقه‌ی یک جلسه: نکات، تمرین‌ها، اجراها و بازخوردها. */
  @Get("bookings/:bookingId/learning")
  async session(
    @CurrentUserId() userId: string,
    @Param("bookingId", zodPipe(uuidSchema)) bookingId: string,
  ): Promise<SessionLearningView> {
    return this.learning.session(bookingId, userId);
  }

  /** نکات جلسه — یکی به ازای هر جلسه، پس `PUT` است نه `POST`. */
  @Put("bookings/:bookingId/notes")
  async writeNote(
    @CurrentUserId() userId: string,
    @Param("bookingId", zodPipe(uuidSchema)) bookingId: string,
    @Body(zodPipe(noteSchema)) body: z.infer<typeof noteSchema>,
  ): Promise<{ content: string; updatedAt: string }> {
    return this.learning.writeNote(bookingId, userId, body.content);
  }

  @Post("bookings/:bookingId/assignments")
  @HttpCode(HttpStatus.CREATED)
  async createAssignment(
    @CurrentUserId() userId: string,
    @Param("bookingId", zodPipe(uuidSchema)) bookingId: string,
    @Body(zodPipe(createAssignmentSchema)) body: z.infer<typeof createAssignmentSchema>,
  ): Promise<AssignmentView> {
    return this.learning.createAssignment(bookingId, userId, {
      title: body.title,
      description: body.description?.length ? body.description : null,
      dueDate: body.dueDate ?? null,
      attachmentKeys: body.attachments ?? [],
    });
  }

  @Patch("assignments/:assignmentId")
  async updateAssignment(
    @CurrentUserId() userId: string,
    @Param("assignmentId", zodPipe(uuidSchema)) assignmentId: string,
    @Body(zodPipe(updateAssignmentSchema)) body: z.infer<typeof updateAssignmentSchema>,
  ): Promise<AssignmentView> {
    return this.learning.updateAssignment(assignmentId, userId, body);
  }

  /** تکمیل دستی هنرجو — مستقل از ارسال اجرا و بازخورد. */
  @Put("assignments/:assignmentId/completion")
  async setCompletion(
    @CurrentUserId() userId: string,
    @Param("assignmentId", zodPipe(uuidSchema)) assignmentId: string,
    @Body(zodPipe(completionSchema)) body: z.infer<typeof completionSchema>,
  ): Promise<AssignmentCompletionView> {
    return this.learning.setCompletion(assignmentId, userId, body.completed);
  }

  /**
   * حذف تمرین، با اجراها و بازخوردهایش.
   *
   * `204` برمی‌گرداند نه سطر حذف‌شده: چیزی برای نشان دادن نمانده و
   * فرانت هم بعدش کل حلقه را دوباره می‌خواند.
   */
  @Delete("assignments/:assignmentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAssignment(
    @CurrentUserId() userId: string,
    @Param("assignmentId", zodPipe(uuidSchema)) assignmentId: string,
  ): Promise<void> {
    await this.learning.deleteAssignment(assignmentId, userId);
  }

  /**
   * حذف یک پیوست.
   *
   * نشانی در **بدنه** می‌آید نه در مسیر: پیوست شناسه‌ی خودش را ندارد و
   * نشانی‌اش هم اسلش و کاراکترهای کدشده دارد، که در پارامتر مسیر
   * دردسر است. `DELETE` با بدنه مجاز است و اینجا صادق‌ترین شکل کار.
   */
  @Delete("assignments/:assignmentId/attachments")
  async deleteAttachment(
    @CurrentUserId() userId: string,
    @Param("assignmentId", zodPipe(uuidSchema)) assignmentId: string,
    @Body(zodPipe(attachmentRefSchema)) body: z.infer<typeof attachmentRefSchema>,
  ): Promise<AssignmentView> {
    return this.learning.deleteAttachment(assignmentId, userId, body.url);
  }

  @Post("assignments/:assignmentId/submissions")
  @HttpCode(HttpStatus.CREATED)
  async createSubmission(
    @CurrentUserId() userId: string,
    @Param("assignmentId", zodPipe(uuidSchema)) assignmentId: string,
    @Body(zodPipe(submissionSchema)) body: z.infer<typeof submissionSchema>,
  ): Promise<SubmissionView> {
    return this.learning.createSubmission(assignmentId, userId, {
      objectKey: body.objectKey,
      durationSeconds: body.durationSeconds ?? null,
    });
  }

  /** حذف اجرا — فقط خودِ هنرجو، و فقط تا وقتی بازخورد نگرفته. */
  @Delete("submissions/:submissionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSubmission(
    @CurrentUserId() userId: string,
    @Param("submissionId", zodPipe(uuidSchema)) submissionId: string,
  ): Promise<void> {
    await this.learning.deleteSubmission(submissionId, userId);
  }

  /** بازخورد روی یک اجرا. یکی به ازای هر اجرا، پس دوباره فرستادن ویرایش است. */
  @Put("submissions/:submissionId/feedback")
  async writeFeedback(
    @CurrentUserId() userId: string,
    @Param("submissionId", zodPipe(uuidSchema)) submissionId: string,
    @Body(zodPipe(feedbackSchema)) body: z.infer<typeof feedbackSchema>,
  ): Promise<FeedbackView> {
    return this.learning.writeFeedback(submissionId, userId, {
      content: body.content?.length ? body.content : null,
      voiceObjectKey: body.voiceObjectKey ?? null,
    });
  }

  /** تمرین‌های کاربر در همه‌ی جلسه‌هایش — برای هر دو نقش. */
  @Get("practice")
  async practice(
    @CurrentUserId() userId: string,
  ): Promise<{ assignments: PracticeItem[] }> {
    return { assignments: await this.learning.practice(userId) };
  }
}
