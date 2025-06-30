<!-- src/components/forms/FormTextarea.vue -->
<template>
  <div class="mb-4">
    <label v-if="label" :for="id" class="form-label">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <textarea
      :id="id"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      class="form-input"
      :class="{ 'border-red-500': error }"
      v-bind="$attrs"
    ></textarea>
    <p v-if="error" class="text-red-500 text-sm mt-1">{{ error }}</p>
    <p v-if="helper" class="text-blue-500 text-sm mt-1">{{ helper }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  required: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  helper: {
    type: String,
    default: ''
  }
})

defineEmits(['update:modelValue'])

// Generate unique ID for accessibility
const id = computed(() => 
  props.label ? props.label.toLowerCase().replace(/\s+/g, '-') + '-textarea' : 
  'textarea-' + Math.random().toString(36).substr(2, 9)
)
</script>