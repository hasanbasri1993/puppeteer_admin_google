<!-- src/components/forms/FormInput.vue -->
<template>
  <div class="mb-4">
    <label v-if="label" :for="id" class="form-label">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      class="form-input"
      :class="{ 'border-red-500': error }"
      v-bind="$attrs"
    >
    <p v-if="error" class="text-red-500 text-sm mt-1">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'text'
  },
  required: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
})

defineEmits(['update:modelValue'])

const id = computed(() => 
  props.label ? props.label.toLowerCase().replace(/\s+/g, '-') + '-input' : 
  'input-' + Math.random().toString(36).substr(2, 9)
)
</script>