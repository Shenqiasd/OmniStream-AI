import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, TokenInfo } from '@yikart/aitoearn-auth'
import { ApiDoc } from '@yikart/common'
import {
  DeleteProviderSettingDto,
  GetProviderSettingDto,
  TestProviderConnectionDto,
  UpsertProviderSettingDto,
} from './dto/provider-settings.dto'
import { ProviderSettingsService } from './provider-settings.service'

@ApiTags('OpenSource/Ai/ProviderSettings')
@Controller('ai/provider-settings')
export class ProviderSettingsController {
  constructor(
    private readonly providerSettingsService: ProviderSettingsService,
  ) {}

  @ApiDoc({
    summary: 'List AI provider settings',
  })
  @Get()
  async list(@GetToken() token: TokenInfo) {
    return await this.providerSettingsService.list(token.id)
  }

  @ApiDoc({
    summary: 'Get AI provider setting by key',
  })
  @Get(':providerKey')
  async get(@GetToken() token: TokenInfo, @Param() params: GetProviderSettingDto) {
    return await this.providerSettingsService.get(params.providerKey, token.id)
  }

  @ApiDoc({
    summary: 'Create AI provider setting',
    body: UpsertProviderSettingDto.schema,
  })
  @Post()
  async create(@GetToken() token: TokenInfo, @Body() body: UpsertProviderSettingDto) {
    return await this.providerSettingsService.upsert(token.id, body)
  }

  @ApiDoc({
    summary: 'Update AI provider setting',
    body: UpsertProviderSettingDto.schema,
  })
  @Put(':providerKey')
  async update(@GetToken() token: TokenInfo, @Param() params: GetProviderSettingDto, @Body() body: UpsertProviderSettingDto) {
    return await this.providerSettingsService.upsert(token.id, {
      ...body,
      providerKey: params.providerKey,
    })
  }

  @ApiDoc({
    summary: 'Delete AI provider setting',
  })
  @Delete(':providerKey')
  async remove(@GetToken() token: TokenInfo, @Param() params: DeleteProviderSettingDto) {
    return await this.providerSettingsService.remove(token.id, params)
  }

  @ApiDoc({
    summary: 'Test AI provider connection',
    body: TestProviderConnectionDto.schema,
  })
  @Post('test-connection')
  async testConnection(@GetToken() token: TokenInfo, @Body() body: TestProviderConnectionDto) {
    return await this.providerSettingsService.testConnection(token.id, body)
  }
}
