import {
  buildAttributesSchema,
  CreateListingInput,
  type ListingCondition,
} from "@yodkai/shared";
import * as Crypto from "expo-crypto";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  Button,
  Dialog,
  HelperText,
  IconButton,
  List,
  Portal,
  ProgressBar,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
} from "react-native-paper";

import { deleteDraft, loadDraft, saveDraft } from "@/core/offline/drafts";
import { CONDITION_LABEL } from "@/features/listings/components/ListingCard";
import { useCategories, useCreateListing } from "@/features/listings/hooks";
import { ProvincePicker } from "@/features/profile/ProvincePicker";
import { useMyProfile } from "@/features/profile/hooks";
import type { CategoryFieldRow } from "@/features/listings/api";

const MAX_IMAGES = 10;
const DRAFT_KIND = "listing";

interface WizardDraft {
  id: string;
  step: number;
  imageUris: string[];
  categoryId: string | null;
  title: string;
  description: string;
  condition: ListingCondition;
  attributes: Record<string, string>;
  price: string;
  provinceCode: string | null;
}

function newDraft(): WizardDraft {
  return {
    id: Crypto.randomUUID(),
    step: 0,
    imageUris: [],
    categoryId: null,
    title: "",
    description: "",
    condition: "good",
    attributes: {},
    price: "",
    provinceCode: null,
  };
}

/** Convert raw text inputs to typed values per the category template. */
function toTypedAttributes(
  fields: CategoryFieldRow[],
  raw: Record<string, string>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (v == null || v.trim() === "") continue;
    out[f.key] = f.type === "number" ? Number(v) : v.trim();
  }
  return out;
}

/**
 * Screen 11 — Create listing wizard (3 steps): photos → category template →
 * price/area. Draft autosaves to SQLite; submit works offline via the outbox
 * (BLUEPRINT.md §8 step 3 test: ลงประกาศ offline แล้ว sync เมื่อ online).
 */
export default function SellScreen() {
  const router = useRouter();
  const categories = useCategories();
  const profile = useMyProfile();
  const create = useCreateListing();

  const [draft, setDraft] = useState<WizardDraft>(
    () => loadDraft<WizardDraft>(DRAFT_KIND) ?? newDraft(),
  );
  const [error, setError] = useState<string | null>(null);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // draft autosave (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(DRAFT_KIND, draft), 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft]);

  const patch = (p: Partial<WizardDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...p }));
  };

  const category = categories.data?.find((c) => c.id === draft.categoryId);
  const fields = category?.category_fields ?? [];

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - draft.imageUris.length,
      quality: 1,
    });
    if (!result.canceled) {
      patch({
        imageUris: [
          ...draft.imageUris,
          ...result.assets.map((a) => a.uri),
        ].slice(0, MAX_IMAGES),
      });
    }
  };

  const validateStep = (): string | null => {
    if (draft.step === 0) {
      return draft.imageUris.length > 0 ? null : "กรุณาเลือกรูปอย่างน้อย 1 รูป";
    }
    if (draft.step === 1) {
      if (!category) return "กรุณาเลือกหมวดหมู่";
      if (draft.title.trim().length < 3)
        return "กรุณากรอกชื่อประกาศอย่างน้อย 3 ตัวอักษร";
      const attrs = toTypedAttributes(fields, draft.attributes);
      const parsed = buildAttributesSchema(fields).safeParse(attrs);
      if (!parsed.success) {
        const missing = fields.find(
          (f) => f.required && attrs[f.key] == null,
        );
        return missing
          ? `กรุณากรอก "${missing.label_i18n.th ?? missing.key}"`
          : "ข้อมูลรายละเอียดไม่ถูกต้อง กรุณาตรวจอีกครั้ง";
      }
      return null;
    }
    // step 2
    const price = Number(draft.price);
    if (draft.price.trim() === "" || !Number.isFinite(price) || price < 0)
      return "กรุณากรอกราคาให้ถูกต้อง";
    if (!draft.provinceCode) return "กรุณาเลือกจังหวัด";
    return null;
  };

  const next = () => {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    if (draft.step < 2) {
      patch({ step: draft.step + 1 });
      return;
    }
    void submit();
  };

  const submit = async () => {
    if (!profile.data) return;
    const input = CreateListingInput.safeParse({
      id: draft.id,
      categoryId: draft.categoryId,
      title: draft.title,
      description: draft.description,
      condition: draft.condition,
      askingPrice: Math.round(Number(draft.price) * 100) / 100,
      provinceCode: draft.provinceCode,
      attributes: toTypedAttributes(fields, draft.attributes),
    });
    if (!input.success) {
      setError("ข้อมูลไม่ครบถ้วน กรุณาย้อนกลับไปตรวจอีกครั้ง");
      return;
    }
    create.mutate(
      {
        input: input.data,
        sellerId: profile.data.id,
        imageUris: draft.imageUris,
      },
      {
        onSuccess: (result) => {
          deleteDraft(DRAFT_KIND);
          setDraft(newDraft());
          setSnackbar(
            result === "synced"
              ? "ลงประกาศเรียบร้อยแล้ว"
              : "บันทึกแล้ว — จะลงประกาศให้อัตโนมัติเมื่อกลับมาออนไลน์",
          );
          router.push("/my-listings");
        },
        onError: () => setError("ลงประกาศไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
      },
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ProgressBar progress={(draft.step + 1) / 3} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {draft.step === 0 ? (
          <>
            <Text variant="titleMedium">
              รูปสินค้า ({draft.imageUris.length}/{MAX_IMAGES})
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {draft.imageUris.map((uri, i) => (
                <View key={uri}>
                  <Image
                    source={uri}
                    style={{ width: 100, height: 100, borderRadius: 8 }}
                    contentFit="cover"
                  />
                  <IconButton
                    icon="close-circle"
                    size={20}
                    style={{ position: "absolute", top: -12, right: -12 }}
                    onPress={() =>
                      patch({
                        imageUris: draft.imageUris.filter((_, j) => j !== i),
                      })
                    }
                    accessibilityLabel={`ลบรูปที่ ${i + 1}`}
                  />
                </View>
              ))}
              {draft.imageUris.length < MAX_IMAGES ? (
                <Pressable
                  onPress={() => void pickImages()}
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: "#888",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="เพิ่มรูป"
                  testID="add-images"
                >
                  <IconButton icon="camera-plus-outline" />
                </Pressable>
              ) : null}
            </View>
            <Text variant="bodySmall" style={{ opacity: 0.6 }}>
              รูปแรกจะเป็นรูปปก ระบบจะบีบอัดรูปให้อัตโนมัติ
            </Text>
          </>
        ) : draft.step === 1 ? (
          <>
            <TextInput
              mode="outlined"
              label="หมวดหมู่"
              value={category?.name_i18n.th ?? ""}
              editable={false}
              right={
                <TextInput.Icon
                  icon="menu-down"
                  onPress={() => setCategoryDialog(true)}
                />
              }
              onPressIn={() => setCategoryDialog(true)}
              testID="category-input"
            />
            <TextInput
              mode="outlined"
              label="ชื่อประกาศ"
              value={draft.title}
              onChangeText={(v) => patch({ title: v })}
              maxLength={120}
              testID="title-input"
            />
            <TextInput
              mode="outlined"
              label="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
              value={draft.description}
              onChangeText={(v) => patch({ description: v })}
              multiline
              numberOfLines={4}
              maxLength={4000}
            />
            <Text variant="labelLarge">สภาพสินค้า</Text>
            <SegmentedButtons
              value={draft.condition}
              onValueChange={(v) =>
                patch({ condition: v as ListingCondition })
              }
              buttons={(
                Object.entries(CONDITION_LABEL) as [ListingCondition, string][]
              ).map(([value, label]) => ({ value, label }))}
            />
            {fields.map((f) => {
              const label = `${f.label_i18n.th ?? f.key}${f.required ? " *" : ""}`;
              if (f.type === "select" && f.options && f.options.length > 0) {
                return (
                  <View key={f.id}>
                    <Text variant="labelLarge" style={{ marginBottom: 8 }}>
                      {label}
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {f.options.map((opt) => (
                        <Button
                          key={opt}
                          mode={
                            draft.attributes[f.key] === opt
                              ? "contained"
                              : "outlined"
                          }
                          compact
                          onPress={() =>
                            patch({
                              attributes: { ...draft.attributes, [f.key]: opt },
                            })
                          }
                        >
                          {opt}
                        </Button>
                      ))}
                    </View>
                  </View>
                );
              }
              return (
                <TextInput
                  key={f.id}
                  mode="outlined"
                  label={label}
                  value={draft.attributes[f.key] ?? ""}
                  keyboardType={f.type === "number" ? "numeric" : "default"}
                  onChangeText={(v) =>
                    patch({ attributes: { ...draft.attributes, [f.key]: v } })
                  }
                />
              );
            })}
          </>
        ) : (
          <>
            <TextInput
              mode="outlined"
              label="ราคาที่ตั้งขาย (บาท)"
              value={draft.price}
              onChangeText={(v) => patch({ price: v.replace(/[^\d.]/g, "") })}
              keyboardType="decimal-pad"
              testID="price-input"
            />
            <ProvincePicker
              value={draft.provinceCode}
              onChange={(code) => patch({ provinceCode: code })}
            />
            <List.Section title="ตรวจสอบก่อนลงประกาศ">
              <List.Item title="รูป" description={`${draft.imageUris.length} รูป`} />
              <List.Item title="หมวด" description={category?.name_i18n.th ?? "-"} />
              <List.Item title="ชื่อประกาศ" description={draft.title || "-"} />
              <List.Item
                title="สภาพ"
                description={CONDITION_LABEL[draft.condition]}
              />
            </List.Section>
          </>
        )}

        <HelperText type="error" visible={error != null}>
          {error ?? " "}
        </HelperText>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {draft.step > 0 ? (
            <Button
              mode="outlined"
              style={{ flex: 1 }}
              onPress={() => patch({ step: draft.step - 1 })}
              disabled={create.isPending}
            >
              ย้อนกลับ
            </Button>
          ) : null}
          <Button
            mode="contained"
            style={{ flex: 2 }}
            onPress={next}
            loading={create.isPending}
            disabled={create.isPending || categories.isPending}
            testID="wizard-next"
          >
            {draft.step < 2 ? "ถัดไป" : "ลงประกาศ"}
          </Button>
        </View>
      </ScrollView>

      <Portal>
        <Dialog
          visible={categoryDialog}
          onDismiss={() => setCategoryDialog(false)}
          style={{ maxHeight: "80%" }}
        >
          <Dialog.Title>เลือกหมวดหมู่</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView>
              {(categories.data ?? []).map((c) => (
                <List.Item
                  key={c.id}
                  title={c.name_i18n.th ?? c.slug}
                  onPress={() => {
                    patch({ categoryId: c.id, attributes: {} });
                    setCategoryDialog(false);
                  }}
                />
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbar != null}
        onDismiss={() => setSnackbar(null)}
        duration={4000}
      >
        {snackbar ?? ""}
      </Snackbar>
    </View>
  );
}
