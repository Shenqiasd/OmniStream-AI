import { Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '@yikart/aitoearn-auth'

/**
 * Stub controllers for SaaS-only endpoints that the frontend still calls.
 * Returns empty/default data so the UI doesn't show 404 errors.
 */

@ApiTags('Stubs')
@Controller('agent')
export class AgentStubController {
  @Public()
  @Get('tasks')
  listTasks(@Query('page') page = 1, @Query('pageSize') pageSize = 10) {
    return { list: [], total: 0, page: Number(page), pageSize: Number(pageSize) }
  }

  @Public()
  @Post('tasks')
  createTask() {
    return { taskId: null, message: 'Agent tasks not available in local mode' }
  }

  @Public()
  @Get('tasks/:taskId')
  getTask(@Param('taskId') taskId: string) {
    return { taskId, status: 'not_found' }
  }

  @Public()
  @Get('tasks/:taskId/messages')
  getTaskMessages() {
    return { list: [], total: 0 }
  }

  @Public()
  @Get('tasks/:taskId/rating')
  getTaskRating() {
    return { data: { rating: null, comment: null } }
  }

  @Public()
  @Post('tasks/:taskId/rating')
  createTaskRating() {
    return { success: true }
  }

  @Public()
  @Post('tasks/:taskId/abort')
  abortTask() {
    return { success: true }
  }

  @Public()
  @Delete('tasks/:taskId')
  deleteTask() {
    return { success: true }
  }

  @Public()
  @Patch('tasks/:taskId')
  updateTask() {
    return { success: true }
  }

  @Public()
  @Post('tasks/:taskId/share')
  shareTask() {
    return { token: '', expiresAt: '', urlPath: '' }
  }
}

@ApiTags('Stubs')
@Controller('user')
export class CreditsStubController {
  @Public()
  @Get('credits')
  getBalance() {
    return { balance: 0 }
  }

  @Public()
  @Get('credits/records')
  getRecords(@Query('page') page = 1, @Query('pageSize') pageSize = 10) {
    return { list: [], total: 0, page: Number(page), pageSize: Number(pageSize), totalPages: 0 }
  }
}
